/**
 * @module
 * Builds the four simple `BuildContext` lifecycle methods (`watch`,
 * `serve`, `cancel`, `dispose`) returned from
 * {@link ./build_context.ts:buildOrContextImpl}. The complex `rebuild`
 * method lives in {@link ./build_context_rebuild.ts} since it needs
 * deeper coordination with the `on-end` callback.
 *
 * @see ./build_context.ts
 * @see ./build_context_rebuild.ts
 * @see ../types/build.ts
 */
import type * as types from '../types/mod.ts'
import * as protocol from '../stdio_protocol/mod.ts'
import {
  checkForInvalidFlags,
  getFlag,
  mustBeFunction,
  mustBeInteger,
  mustBeObject,
  mustBeString,
  mustBeStringOrArrayOfStrings,
  mustBeValidPortNumber,
  type OptionKeys,
} from '../validation.ts'
import type { Refs, StreamIn } from './types.ts'
import type { RequestCallback } from '../plugin_runner/mod.ts'

/** Inputs the lifecycle factories thread through every method. */
export interface BuildContextContext {
  /** Build key the lifecycle methods target. */
  buildKey: number
  refs: Refs
  streamIn: StreamIn
  /** Per-build callback registry that `serve-request` is registered into. */
  requestCallbacks: { [command: string]: RequestCallback }
  /** Tracked so we don't dispose twice. */
  didDisposeRef: { value: boolean }
  /** Function the transport runs to fire registered `onDispose` hooks. */
  scheduleOnDisposeCallbacks: () => void
  /** Internal send helpers passed in by the channel. */
  sendRequest: <Req, Res>(
    refs: Refs | null,
    value: Req,
    callback: (error: string | null, response: Res | null) => void,
  ) => void
  /** Channel's `sendResponse` helper. Used to ack `serve-request` events. */
  sendResponse: (id: number, value: protocol.Value) => void
  /** Shared mutable state between `rebuild` and the `on-end` handler. */
  rebuildState: RebuildState
}

/** Mutable state shared between the `rebuild` closure and the `on-end`
 * handler. Both must write to the same fields, so a plain object holder
 * keeps the seam explicit. */
export interface RebuildState {
  latestResultPromise: Promise<types.BuildResult> | undefined
  provideLatestResult:
    | ((
      error: types.BuildFailure | null,
      result: types.BuildResult | null,
    ) => void)
    | undefined
}

/** Builds the `watch` method. */
export function makeWatch(ctx: BuildContextContext): (
  options?: types.WatchOptions,
) => Promise<void> {
  const { buildKey, refs, streamIn } = ctx
  return (options = {}) =>
    new Promise<void>((resolve, reject) => {
      if (!streamIn.hasFS) {
        throw new Error(`Cannot use the "watch" API in this environment`)
      }
      const keys: OptionKeys = {}
      const delay = getFlag(options, keys, 'delay', mustBeInteger)
      checkForInvalidFlags(options, keys, `in watch() call`)
      const request: protocol.WatchRequest = {
        command: 'watch',
        key: buildKey,
      }
      if (delay) request.delay = delay
      ctx.sendRequest<protocol.WatchRequest, null>(refs, request, (error) => {
        if (error) reject(new Error(error))
        else resolve(undefined)
      })
    })
}

/** Builds the `serve` method. */
export function makeServe(
  ctx: BuildContextContext,
): (options?: types.ServeOptions) => Promise<types.ServeResult> {
  const { buildKey, refs, streamIn, requestCallbacks, sendResponse } = ctx
  return (options = {}) =>
    new Promise<types.ServeResult>((resolve, reject) => {
      if (!streamIn.hasFS) {
        throw new Error(`Cannot use the "serve" API in this environment`)
      }
      const keys: OptionKeys = {}
      const port = getFlag(options, keys, 'port', mustBeValidPortNumber)
      const host = getFlag(options, keys, 'host', mustBeString)
      const servedir = getFlag(options, keys, 'servedir', mustBeString)
      const keyfile = getFlag(options, keys, 'keyfile', mustBeString)
      const certfile = getFlag(options, keys, 'certfile', mustBeString)
      const fallback = getFlag(options, keys, 'fallback', mustBeString)
      const cors = getFlag(options, keys, 'cors', mustBeObject)
      const onRequest = getFlag(
        options,
        keys,
        'onRequest',
        mustBeFunction as (value: unknown) => string | null,
      )
      checkForInvalidFlags(options, keys, `in serve() call`)

      const request: protocol.ServeRequest = {
        command: 'serve',
        key: buildKey,
        onRequest: !!onRequest,
      }
      if (port !== void 0) request.port = port
      if (host !== void 0) request.host = host
      if (servedir !== void 0) request.servedir = servedir
      if (keyfile !== void 0) request.keyfile = keyfile
      if (certfile !== void 0) request.certfile = certfile
      if (fallback !== void 0) request.fallback = fallback

      if (cors) {
        const corsKeys: OptionKeys = {}
        const origin = getFlag(
          cors,
          corsKeys,
          'origin',
          mustBeStringOrArrayOfStrings,
        )
        checkForInvalidFlags(cors, corsKeys, `on "cors" object`)
        if (Array.isArray(origin)) request.corsOrigin = origin
        else if (origin !== void 0) request.corsOrigin = [origin]
      }

      ctx.sendRequest<protocol.ServeRequest, protocol.ServeResponse>(
        refs,
        request,
        (error, response) => {
          if (error) return reject(new Error(error))
          if (onRequest) {
            requestCallbacks['serve-request'] = (
              id,
              req: protocol.OnServeRequest,
            ) => {
              onRequest(req.args)
              sendResponse(id, {})
            }
          }
          resolve(response!)
        },
      )
    })
}

/** Builds the `cancel` method. */
export function makeCancel(ctx: BuildContextContext): () => Promise<void> {
  const { buildKey, refs, didDisposeRef } = ctx
  return () =>
    new Promise<void>((resolve) => {
      if (didDisposeRef.value) return resolve()
      const request: protocol.CancelRequest = {
        command: 'cancel',
        key: buildKey,
      }
      ctx.sendRequest<protocol.CancelRequest, null>(refs, request, () => {
        resolve() // We don't care about errors here
      })
    })
}

/** Builds the `dispose` method. */
export function makeDispose(
  ctx: BuildContextContext,
): () => Promise<void> {
  const { buildKey, refs, didDisposeRef, scheduleOnDisposeCallbacks } = ctx
  return () =>
    new Promise<void>((resolve) => {
      if (didDisposeRef.value) return resolve()
      didDisposeRef.value = true // Don't dispose more than once
      const request: protocol.DisposeRequest = {
        command: 'dispose',
        key: buildKey,
      }
      ctx.sendRequest<protocol.DisposeRequest, null>(refs, request, () => {
        resolve() // We don't care about errors here
        scheduleOnDisposeCallbacks()

        // Only remove the reference here when we know the Go code has seen
        // this "dispose" call. We don't want to remove any registered
        // callbacks before that point because the Go code might still be
        // sending us events. If we remove the reference earlier then we
        // will return errors for those events, which may end up being
        // printed to the terminal where the user can see them, which
        // would be very confusing.
        refs.unref()
      })
    })
}
