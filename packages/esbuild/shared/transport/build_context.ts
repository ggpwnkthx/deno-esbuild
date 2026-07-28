/**
 * @module
 * Higher-level implementation of the `build` and `context` calls. Bundles
 * plugin setup, validates the options, and sends the final `build` packet
 * to the service. Implemented in continuation-passing style so the same
 * code path can run synchronously (`buildSync`) and asynchronously.
 *
 * The function nests `buildOrContextContinue` so it can close over the
 * common state (options, refs, requestCallbacks, the latest result
 * promise) and factor out the response-to-result mapping for reuse on
 * rebuilds. The `BuildContext` lifecycle methods (`rebuild`, `watch`,
 * `serve`, `cancel`, `dispose`) are built by the factories in
 * {@link ./build_context_lifecycle.ts}.
 *
 * @see ./channel.ts
 * @see ./types.ts
 * @see ./build_context_lifecycle.ts
 * @see ../plugin_runner.ts
 */
import type * as types from '../types/mod.ts'
import * as protocol from '../stdio_protocol/mod.ts'
import { buildLogLevelDefaultValue, flagsForBuildOptions, pushLogFlags } from '../flags/mod.ts'
import { failureErrorWithLog } from '../message_sanitize.ts'
import { extractErrorMessageV8 } from '../v8_stack.ts'
import {
  createObjectStash,
  handlePlugins,
  type PluginStreamIn,
  type RequestCallback,
  type RunOnEndCallbacks,
} from '../plugin_runner/mod.ts'
import type { Refs, StreamIn } from './types.ts'
import { buildResponseToResult } from './build_response.ts'
import { type BuildContextContext, type RebuildState } from './build_context_lifecycle.ts'
import { makeRebuild } from './build_context_rebuild.ts'
import { makeCancel, makeDispose, makeServe, makeWatch } from './build_context_lifecycle.ts'

/**
 * Higher-level implementation of the `build` and `context` calls. Bundles
 * plugin setup, validates the options, and sends the final `build` packet
 * to the service. Implemented in continuation-passing style so the same
 * code path can run synchronously (`buildSync`) and asynchronously.
 */
export function buildOrContextImpl(
  callName: string,
  buildKey: number,
  sendRequest: <Req, Res>(
    refs: Refs | null,
    value: Req,
    callback: (error: string | null, response: Res | null) => void,
  ) => void,
  sendResponse: (id: number, value: protocol.Value) => void,
  refs: Refs,
  streamIn: StreamIn,
  requestCallbacks: { [command: string]: RequestCallback },
  options: types.BuildOptions,
  isTTY: boolean,
  defaultWD: string,
  callback: (
    err: Error | null,
    res: types.BuildResult | types.BuildContext | null,
  ) => void,
): void {
  const details = createObjectStash()
  const isContext = callName === 'context'

  const handleError = (e: Error, pluginName: string): void => {
    const flags: string[] = []
    try {
      pushLogFlags(flags, options, {}, isTTY, buildLogLevelDefaultValue)
    } catch {
      // This is expected to potentially fail if the options are invalid
    }
    const message = extractErrorMessageV8(
      e,
      streamIn,
      details,
      void 0,
      pluginName,
    )
    sendRequest(refs, { command: 'error', flags, error: message }, () => {
      message.detail = details.load(message.detail)
      callback(
        failureErrorWithLog(
          isContext ? 'Context failed' : 'Build failed',
          [message],
          [],
        ),
        null,
      )
    })
  }

  let plugins: types.Plugin[] | undefined
  if (typeof options === 'object') {
    const value = options.plugins
    if (value !== void 0) {
      if (!Array.isArray(value)) {
        return handleError(new Error(`"plugins" must be an array`), '')
      }
      plugins = value
    }
  }

  if (plugins && plugins.length > 0) {
    if (streamIn.isSync) {
      return handleError(
        new Error('Cannot use plugins in synchronous API calls'),
        '',
      )
    }

    // Plugins can use async/await because they can't be run with "buildSync"
    handlePlugins(
      buildKey,
      sendRequest,
      sendResponse,
      refs,
      streamIn as unknown as PluginStreamIn,
      requestCallbacks,
      options,
      plugins,
      details,
    ).then(
      (result) => {
        if (!result.ok) return handleError(result.error, result.pluginName)
        try {
          buildOrContextContinue(
            result.requestPlugins,
            result.runOnEndCallbacks,
            result.scheduleOnDisposeCallbacks,
          )
        } catch (e) {
          handleError(e as Error, '')
        }
      },
      (e) => handleError(e as Error, ''),
    )
    return
  }

  try {
    buildOrContextContinue(null, (_result, done) => done([], []), () => {})
  } catch (e) {
    handleError(e as Error, '')
  }

  // "buildOrContext" cannot be written using async/await due to "buildSync"
  // and must be written in continuation-passing style instead
  function buildOrContextContinue(
    requestPlugins: protocol.BuildPlugin[] | null,
    runOnEndCallbacks: RunOnEndCallbacks,
    scheduleOnDisposeCallbacks: () => void,
  ) {
    const writeDefault = streamIn.hasFS
    const {
      entries,
      flags,
      write,
      stdinContents,
      stdinResolveDir,
      absWorkingDir,
      nodePaths,
      mangleCache,
    } = flagsForBuildOptions(
      callName,
      options,
      isTTY,
      buildLogLevelDefaultValue,
      writeDefault,
    )
    if (write && !streamIn.hasFS) {
      throw new Error(`The "write" option is unavailable in this environment`)
    }

    // Construct the request
    const request: protocol.BuildRequest = {
      command: 'build',
      key: buildKey,
      entries,
      flags,
      write,
      stdinContents,
      stdinResolveDir,
      absWorkingDir: absWorkingDir || defaultWD,
      nodePaths,
      context: isContext,
    }
    if (requestPlugins) request.plugins = requestPlugins
    if (mangleCache) request.mangleCache = mangleCache

    // Factor out response handling so it can be reused for rebuilds.
    // Body lives in {@link ./build_response.ts:buildResponseToResult}.
    const handleResponse = (
      response: protocol.BuildResponse | null,
      callback: (
        error: types.BuildFailure | null,
        result: types.BuildResult | null,
        onEndErrors: types.Message[],
        onEndWarnings: types.Message[],
      ) => void,
    ): void => {
      buildResponseToResult(response!, details, runOnEndCallbacks, callback)
    }

    // In context mode, Go runs the "onEnd" callbacks instead of JavaScript
    const rebuildState: RebuildState = {
      latestResultPromise: undefined,
      provideLatestResult: undefined,
    }
    if (isContext) {
      requestCallbacks['on-end'] = (id, request: protocol.OnEndRequest) =>
        new Promise((resolve) => {
          handleResponse(
            request,
            (err, result, onEndErrors, onEndWarnings) => {
              const response: protocol.OnEndResponse = {
                errors: onEndErrors,
                warnings: onEndWarnings,
              }
              if (rebuildState.provideLatestResult) {
                rebuildState.provideLatestResult(err, result)
              }
              rebuildState.latestResultPromise = undefined
              rebuildState.provideLatestResult = undefined
              sendResponse(id, response as unknown as protocol.Value)
              resolve()
            },
          )
        })
    }

    sendRequest<protocol.BuildRequest, protocol.BuildResponse>(
      refs,
      request,
      (error, response) => {
        if (error) return callback(new Error(error), null)
        if (!isContext) {
          return handleResponse(response!, (err, res) => {
            scheduleOnDisposeCallbacks()
            return callback(err, res)
          })
        }

        // Construct a context object
        if (response!.errors.length > 0) {
          return callback(
            failureErrorWithLog(
              'Context failed',
              response!.errors,
              response!.warnings,
            ),
            null,
          )
        }

        const didDisposeRef = { value: false }
        const lifecycleCtx: BuildContextContext = {
          buildKey,
          refs,
          streamIn,
          requestCallbacks,
          didDisposeRef,
          scheduleOnDisposeCallbacks,
          sendRequest,
          sendResponse,
          rebuildState,
        }
        const result: types.BuildContext = {
          rebuild: makeRebuild(lifecycleCtx),
          watch: makeWatch(lifecycleCtx),
          serve: makeServe(lifecycleCtx),
          cancel: makeCancel(lifecycleCtx),
          dispose: makeDispose(lifecycleCtx),
        }
        refs.ref() // Keep a reference until "dispose" is called
        callback(null, result)
      },
    )
  }
}
