/**
 * @module
 * Public transport surface: the stream-shaped contract that the native
 * (`mod.ts`) and WASM (`wasm.ts`) entry points adapt to. This module owns
 * the stdio packet channel, the `Service`/`StreamService` interface pair,
 * the `createSyncStubs` factory, and the higher-level `buildOrContextImpl`
 * that assembles the wire request from user options.
 */
import type * as types from './types.ts'
import * as protocol from './stdio_protocol.ts'
import { JSON_parse } from './uint8array_json_parser.ts'
import {
  checkForInvalidFlags,
  getFlag,
  mustBeBoolean,
  mustBeFunction,
  mustBeInteger,
  mustBeObject,
  mustBeString,
  mustBeStringOrArrayOfStrings,
  mustBeValidPortNumber,
  type OptionKeys,
  type RuntimeKind,
  validateInitializeOptions,
} from './validation.ts'
import {
  buildLogLevelDefaultValue,
  flagsForBuildOptions,
  flagsForTransformOptions,
  pushLogFlags,
  transformLogLevelDefaultValue,
} from './flags.ts'
import {
  failureErrorWithLog,
  replaceDetailsInMessages,
  sanitizeMessages,
} from './message_sanitize.ts'
import { extractErrorMessageV8 } from './v8_stack.ts'
import {
  createObjectStash,
  handlePlugins,
  type PluginStreamIn,
  type RequestCallback,
  type RunOnEndCallbacks,
} from './plugin_runner.ts'

/**
 * The esbuild binary version string. This is the version of the upstream
 * Go service that the spawned binary reports in the first wire packet; it
 * is intentionally independent of the package version in `deno.json`. The
 * native transport asserts the two match at startup
 * (see {@link createChannel}).
 */
export const ESBUILD_VERSION: string = '0.28.1'

/** Input end of the stdio channel used to drive the esbuild service process/worker. */
export interface StreamIn {
  writeToStdin: (data: Uint8Array) => void
  readFileSync?: (path: string, encoding: 'utf8') => string
  isSync: boolean
  hasFS: boolean
  esbuild: types.PluginBuild['esbuild']
}

/** Output end of the stdio channel from the esbuild service process/worker. */
export interface StreamOut {
  readFromStdout: (data: Uint8Array) => void
  afterClose: (error: Error | null) => void
  service: StreamService
}

/** File system shim passed to the transform() service call. */
export interface StreamFS {
  writeFile(
    contents: string | Uint8Array,
    callback: (path: string | null) => void,
  ): void
  readFile(
    path: string,
    callback: (err: Error | null, contents: string | null) => void,
  ): void
}

/** Reference-counting helpers for stream lifetime management. */
export interface Refs {
  ref(): void
  unref(): void
}

/**
 * The four main RPC methods used to communicate with the esbuild service:
 * `buildOrContext`, `transform`, `formatMessages`, and `analyzeMetafile`.
 * Implemented by {@link createChannel}.
 */
export interface StreamService {
  buildOrContext(args: {
    callName: string
    refs: Refs | null
    options: types.BuildOptions
    isTTY: boolean
    defaultWD: string
    callback: (
      err: Error | null,
      res: types.BuildResult | types.BuildContext | null,
    ) => void
  }): void

  transform(args: {
    callName: string
    refs: Refs | null
    input: string | Uint8Array
    options: types.TransformOptions
    isTTY: boolean
    fs: StreamFS
    callback: (err: Error | null, res: types.TransformResult | null) => void
  }): void

  formatMessages(args: {
    callName: string
    refs: Refs | null
    messages: types.PartialMessage[]
    options: types.FormatMessagesOptions
    callback: (err: Error | null, res: string[] | null) => void
  }): void

  analyzeMetafile(args: {
    callName: string
    refs: Refs | null
    metafile: string
    options: types.AnalyzeMetafileOptions | undefined
    callback: (err: Error | null, res: string | null) => void
  }): void
}

/**
 * The public, transport-agnostic esbuild service surface.
 * Implemented by the native-binary transport (`mod.ts`) and the WASM
 * transport (`wasm.ts`) using a {@link StreamService} as the underlying
 * RPC layer.
 */
export interface Service {
  build: typeof types.build
  context: typeof types.context
  transform: typeof types.transform
  formatMessages: typeof types.formatMessages
  analyzeMetafile: typeof types.analyzeMetafile
}

/** Per-transport knobs for {@link createService}. */
export interface ServiceEnv {
  isTTY: boolean
  defaultWD: string
  transformFs?: StreamFS
}

/**
 * Default in-memory {@link StreamFS} used by transports that cannot read or
 * write real temp files (i.e. the WASM transport). The esbuild WASM service
 * surfaces transform input/output as in-process strings, so neither `readFile`
 * nor `writeFile` is ever invoked.
 */
export const defaultTransformFs: StreamFS = {
  readFile(_path, callback) {
    callback(new Error('Internal error'), null)
  },
  writeFile(_contents, callback) {
    callback(null)
  },
}

/**
 * Builds the public {@link Service} surface from a {@link StreamService}
 * returned by {@link createChannel}. This is the single, shared place where
 * the `build` / `context` / `transform` / `formatMessages` / `analyzeMetafile`
 * Promise wrappers are defined; both transports consume it.
 */
export function createService(service: StreamService, env: ServiceEnv): Service {
  const buildOrContext =
    (callName: 'build' | 'context') =>
    (options: types.BuildOptions): Promise<types.BuildResult | types.BuildContext> =>
      new Promise<types.BuildResult | types.BuildContext>((resolve, reject) =>
        service.buildOrContext({
          callName,
          refs: null,
          options,
          isTTY: env.isTTY,
          defaultWD: env.defaultWD,
          callback: (err, res) => err ? reject(err) : resolve(res!),
        })
      )

  return {
    build: buildOrContext('build') as typeof types.build,
    context: buildOrContext('context') as typeof types.context,
    transform: (input, options) =>
      new Promise<types.TransformResult>((resolve, reject) =>
        service.transform({
          callName: 'transform',
          refs: null,
          input,
          options: options || {},
          isTTY: env.isTTY,
          fs: env.transformFs ?? defaultTransformFs,
          callback: (err, res) => err ? reject(err) : resolve(res!),
        })
      ),
    formatMessages: (messages, options) =>
      new Promise<string[]>((resolve, reject) =>
        service.formatMessages({
          callName: 'formatMessages',
          refs: null,
          messages,
          options,
          callback: (err, res) => err ? reject(err) : resolve(res!),
        })
      ),
    analyzeMetafile: (metafile, options) =>
      new Promise<string>((resolve, reject) =>
        service.analyzeMetafile({
          callName: 'analyzeMetafile',
          refs: null,
          metafile: typeof metafile === 'string' ? metafile : JSON.stringify(metafile),
          options,
          callback: (err, res) => err ? reject(err) : resolve(res!),
        })
      ),
  }
}

/**
 * The set of synchronous esbuild APIs that are not supported in Deno (because
 * Deno lacks the synchronous stdin/stdout access they require). Both transports
 * re-export these from {@link createSyncStubs}.
 */
export interface SyncStubs {
  buildSync: typeof types.buildSync
  transformSync: typeof types.transformSync
  formatMessagesSync: typeof types.formatMessagesSync
  analyzeMetafileSync: typeof types.analyzeMetafileSync
}

/**
 * Builds the four synchronous esbuild stubs that throw on call. They share the
 * exact same error message format as the upstream esbuild API.
 */
export function createSyncStubs(): SyncStubs {
  const throwing = (name: string): () => never => {
    return () => {
      throw new Error(`The "${name}" API does not work in Deno`)
    }
  }
  return {
    buildSync: throwing('buildSync'),
    transformSync: throwing('transformSync'),
    formatMessagesSync: throwing('formatMessagesSync'),
    analyzeMetafileSync: throwing('analyzeMetafileSync'),
  }
}

type CloseData = { didClose: boolean; reason: string }

const MAX_PACKET_BYTES = 64 * 1024 * 1024

export { type RuntimeKind, validateInitializeOptions }

// This can't use any promises in the main execution flow because it must work
// for both sync and async code. There is an exception for plugin code because
// that can't work in sync code anyway.
/**
 * Creates a stdio channel pair for communicating with an esbuild service
 * process/worker. The returned `readFromStdout` accumulates wire packets out
 * of a stream of bytes, eventually reaching the registered `requestCallbacks`
 * for inbound requests and resolving the `responseCallbacks` for outbound
 * responses.
 *
 * Packet growth is bounded by {@link MAX_PACKET_BYTES}; a peer that declares
 * a packet larger than this cap will fail with a descriptive error instead
 * of OOMing the host.
 */
export function createChannel(streamIn: StreamIn): StreamOut {
  const requestCallbacksByKey: {
    [key: number]: { [command: string]: RequestCallback }
  } = {}
  const closeData: CloseData = { didClose: false, reason: '' }
  let responseCallbacks: {
    [id: number]: (error: string | null, response: protocol.Value) => void
  } = {}
  let nextRequestID = 0
  let nextBuildKey = 0

  // Use a long-lived buffer to store stdout data
  let stdout = new Uint8Array(16 * 1024)
  let stdoutUsed = 0
  const readFromStdout = (chunk: Uint8Array) => {
    // Append the chunk to the stdout buffer, growing it as necessary
    const limit = stdoutUsed + chunk.length
    if (limit > MAX_PACKET_BYTES) {
      throw new Error(
        `Incoming esbuild protocol packet exceeds ${MAX_PACKET_BYTES} bytes (got ${limit}); ` +
          `refusing to allocate`,
      )
    }
    if (limit > stdout.length) {
      const swap = new Uint8Array(Math.min(MAX_PACKET_BYTES, limit * 2))
      swap.set(stdout)
      stdout = swap
    }
    stdout.set(chunk, stdoutUsed)
    stdoutUsed += chunk.length

    // Process all complete (i.e. not partial) packets
    let offset = 0
    while (offset + 4 <= stdoutUsed) {
      const length = protocol.readUInt32LE(stdout, offset)
      if (offset + 4 + length > stdoutUsed) {
        break
      }
      offset += 4
      handleIncomingPacket(stdout.subarray(offset, offset + length))
      offset += length
    }
    if (offset > 0) {
      stdout.copyWithin(0, offset, stdoutUsed)
      stdoutUsed -= offset
    }
  }

  const afterClose = (error: Error | null) => {
    // When the process is closed, fail all pending requests
    closeData.didClose = true
    if (error) closeData.reason = ': ' + (error.message || error)
    const text = 'The service was stopped' + closeData.reason
    for (const id in responseCallbacks) {
      responseCallbacks[id]!(text, null)
    }
    responseCallbacks = {}
  }

  const sendRequest = <Req, Res>(
    refs: Refs | null,
    value: Req,
    callback: (error: string | null, response: Res | null) => void,
  ): void => {
    if (closeData.didClose) {
      return callback(
        'The service is no longer running' + closeData.reason,
        null,
      )
    }
    const id = nextRequestID++
    responseCallbacks[id] = (error, response) => {
      try {
        // deno-lint-ignore no-explicit-any
        callback(error, response as any)
      } finally {
        if (refs) refs.unref() // Do this after the callback so the callback can extend the lifetime if needed
      }
    }
    if (refs) refs.ref()
    streamIn.writeToStdin(
      // deno-lint-ignore no-explicit-any
      protocol.encodePacket({ id, isRequest: true, value: value as any }),
    )
  }

  const sendResponse = (id: number, value: protocol.Value): void => {
    if (closeData.didClose) {
      throw new Error('The service is no longer running' + closeData.reason)
    }
    streamIn.writeToStdin(
      protocol.encodePacket({ id, isRequest: false, value }),
    )
  }

  const handleRequest = async (id: number, request: protocol.BuildRequest) => {
    // Catch exceptions in the code below so they get passed to the caller
    try {
      if ((request.command as string) === 'ping') {
        sendResponse(id, {})
        return
      }

      if (typeof request.key === 'number') {
        const requestCallbacks = requestCallbacksByKey[request.key]
        if (!requestCallbacks) {
          // Ignore invalid commands for old builds that no longer exist.
          // This can happen when "context.cancel" and "context.dispose"
          // is called while esbuild is processing many files in parallel.
          // See https://github.com/evanw/esbuild/issues/3318 for details.
          return
        }
        const callback = requestCallbacks[request.command]
        if (callback) {
          await callback(id, request)
          return
        }
      }

      throw new Error(`Invalid command: ` + request.command)
    } catch (e) {
      const errors = [extractErrorMessageV8(e, streamIn, null, void 0, '')]
      try {
        // deno-lint-ignore no-explicit-any
        sendResponse(id, { errors } as any)
      } catch {
        // This may fail if the esbuild process is no longer running, but
        // that's ok. Catch and swallow this exception so that we don't
        // cause an unhandled promise rejection. Our caller isn't expecting
        // this call to fail and doesn't handle the promise rejection.
      }
    }
  }

  let isFirstPacket = true

  const handleIncomingPacket = (bytes: Uint8Array): void => {
    // The first packet is a version check. The Go service sends a plain
    // ASCII version string immediately after connecting; we compare it to
    // ESBUILD_VERSION to catch installation/transcript mismatches before
    // attempting any RPC.
    if (isFirstPacket) {
      isFirstPacket = false

      const binaryVersion = String.fromCharCode(...bytes)
      if (binaryVersion !== ESBUILD_VERSION) {
        throw new Error(
          `Cannot start service: Host version "${ESBUILD_VERSION}" does not match binary version ${
            JSON.stringify(binaryVersion)
          }`,
        )
      }
      return
    }

    const packet = protocol.decodePacket(bytes)

    if (packet.isRequest) {
      handleRequest(
        packet.id,
        packet.value as unknown as protocol.BuildRequest,
      )
    } else {
      const callback = responseCallbacks[packet.id]!
      delete responseCallbacks[packet.id]
      if (packet.value && (packet.value as { error?: string }).error) {
        callback((packet.value as { error: string }).error, {})
      } else callback(null, packet.value)
    }
  }

  const buildOrContext: StreamService['buildOrContext'] = (
    { callName, refs, options, isTTY, defaultWD, callback },
  ) => {
    let refCount = 0
    const buildKey = nextBuildKey++
    const requestCallbacks: { [command: string]: RequestCallback } = {}
    const buildRefs: Refs = {
      ref() {
        if (++refCount === 1) {
          if (refs) refs.ref()
        }
      },
      unref() {
        if (--refCount === 0) {
          delete requestCallbacksByKey[buildKey]
          if (refs) refs.unref()
        }
      },
    }
    requestCallbacksByKey[buildKey] = requestCallbacks

    // Guard the whole "build" request with a temporary ref count bump. We
    // don't want the ref count to be bumped above zero and then back down
    // to zero before the callback is called.
    buildRefs.ref()
    buildOrContextImpl(
      callName,
      buildKey,
      sendRequest,
      sendResponse,
      buildRefs,
      streamIn,
      requestCallbacks,
      options,
      isTTY,
      defaultWD,
      (err, res) => {
        // Now that the initial "build" request is done, we can release our
        // temporary ref count bump. Any code that wants to extend the life
        // of the build will have to do so by explicitly retaining a count.
        try {
          callback(err, res)
        } finally {
          buildRefs.unref()
        }
      },
    )
  }

  const transform: StreamService['transform'] = (
    { callName, refs, input, options, isTTY, fs, callback },
  ) => {
    const details = createObjectStash()

    // Ideally the "transform()" API would be faster than calling "build()"
    // since it doesn't need to touch the file system. However, performance
    // measurements with large files on macOS indicate that sending the data
    // over the stdio pipe can be 2x slower than just using a temporary file.
    //
    // This appears to be an OS limitation. Both the JavaScript and Go code
    // are using large buffers but the pipe only writes data in 8kb chunks.
    // An investigation seems to indicate that this number is hard-coded into
    // the OS source code. Presumably files are faster because the OS uses
    // a larger chunk size, or maybe even reads everything in one syscall.
    //
    // The cross-over size where this starts to be faster is around 1mb on
    // my machine. In that case, this code tries to use a temporary file if
    // possible but falls back to sending the data over the stdio pipe if
    // that doesn't work.
    let start = (inputPath: string | null) => {
      try {
        if (typeof input !== 'string' && !(input instanceof Uint8Array)) {
          throw new Error(
            'The input to "transform" must be a string or a Uint8Array',
          )
        }
        const {
          flags,
          mangleCache,
        } = flagsForTransformOptions(
          callName,
          options,
          isTTY,
          transformLogLevelDefaultValue,
        )
        const request: protocol.TransformRequest = {
          command: 'transform',
          flags,
          inputFS: inputPath !== null,
          input: inputPath !== null
            ? protocol.encodeUTF8(inputPath)
            : typeof input === 'string'
            ? protocol.encodeUTF8(input)
            : input,
        }
        if (mangleCache) request.mangleCache = mangleCache
        sendRequest<protocol.TransformRequest, protocol.TransformResponse>(
          refs,
          request,
          (error, response) => {
            if (error) return callback(new Error(error), null)
            const errors = replaceDetailsInMessages(response!.errors, details)
            const warnings = replaceDetailsInMessages(
              response!.warnings,
              details,
            )
            let outstanding = 1
            const next = () => {
              if (--outstanding === 0) {
                const result: types.TransformResult = {
                  warnings,
                  code: response!.code,
                  map: response!.map,
                  mangleCache: undefined,
                  legalComments: undefined,
                }
                if ('legalComments' in response!) {
                  result.legalComments = response?.legalComments
                }
                if (response!.mangleCache) {
                  result.mangleCache = response?.mangleCache
                }
                callback(null, result)
              }
            }
            if (errors.length > 0) {
              return callback(
                failureErrorWithLog('Transform failed', errors, warnings),
                null,
              )
            }

            // Read the JavaScript file from the file system
            if (response!.codeFS) {
              outstanding++
              fs.readFile(response!.code, (err, contents) => {
                if (err !== null) {
                  callback(err, null)
                } else {
                  response!.code = contents!
                  next()
                }
              })
            }

            // Read the source map file from the file system
            if (response!.mapFS) {
              outstanding++
              fs.readFile(response!.map, (err, contents) => {
                if (err !== null) {
                  callback(err, null)
                } else {
                  response!.map = contents!
                  next()
                }
              })
            }

            next()
          },
        )
      } catch (e) {
        const flags: string[] = []
        try {
          pushLogFlags(flags, options, {}, isTTY, transformLogLevelDefaultValue)
        } catch {
          // This is expected to potentially fail if the options are invalid
        }
        const error = extractErrorMessageV8(e, streamIn, details, void 0, '')
        sendRequest(refs, { command: 'error', flags, error }, () => {
          error.detail = details.load(error.detail)
          callback(failureErrorWithLog('Transform failed', [error], []), null)
        })
      }
    }
    // Check if the input is large enough to warrant using a file
    if (
      (typeof input === 'string' || input instanceof Uint8Array) &&
      input.length > 1024 * 1024
    ) {
      const next = start
      start = () => fs.writeFile(input, next)
    }
    start(null)
  }

  const formatMessages: StreamService['formatMessages'] = (
    { callName, refs, messages, options, callback },
  ) => {
    if (!options) {
      throw new Error(`Missing second argument in ${callName}() call`)
    }
    const keys: OptionKeys = {}
    const kind = getFlag(options, keys, 'kind', mustBeString)
    const color = getFlag(options, keys, 'color', mustBeBoolean)
    const terminalWidth = getFlag(
      options,
      keys,
      'terminalWidth',
      mustBeInteger,
    )
    checkForInvalidFlags(options, keys, `in ${callName}() call`)
    if (kind === void 0) {
      throw new Error(`Missing "kind" in ${callName}() call`)
    }
    if (kind !== 'error' && kind !== 'warning') {
      throw new Error(
        `Expected "kind" to be "error" or "warning" in ${callName}() call`,
      )
    }
    const request: protocol.FormatMsgsRequest = {
      command: 'format-msgs',
      messages: sanitizeMessages(messages, 'messages', null, '', terminalWidth),
      isWarning: kind === 'warning',
    }
    if (color !== void 0) request.color = color
    if (terminalWidth !== void 0) request.terminalWidth = terminalWidth
    sendRequest<protocol.FormatMsgsRequest, protocol.FormatMsgsResponse>(
      refs,
      request,
      (error, response) => {
        if (error) return callback(new Error(error), null)
        callback(null, response!.messages)
      },
    )
  }

  const analyzeMetafile: StreamService['analyzeMetafile'] = (
    { callName, refs, metafile, options, callback },
  ) => {
    if (options === void 0) options = {}
    const keys: OptionKeys = {}
    const color = getFlag(options, keys, 'color', mustBeBoolean)
    const verbose = getFlag(options, keys, 'verbose', mustBeBoolean)
    checkForInvalidFlags(options, keys, `in ${callName}() call`)
    const request: protocol.AnalyzeMetafileRequest = {
      command: 'analyze-metafile',
      metafile,
    }
    if (color !== void 0) request.color = color
    if (verbose !== void 0) request.verbose = verbose
    sendRequest<
      protocol.AnalyzeMetafileRequest,
      protocol.AnalyzeMetafileResponse
    >(
      refs,
      request,
      (error, response) => {
        if (error) return callback(new Error(error), null)
        callback(null, response!.result)
      },
    )
  }

  return {
    readFromStdout,
    afterClose,
    service: {
      buildOrContext,
      transform,
      formatMessages,
      analyzeMetafile,
    },
  }
}

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

    // Factor out response handling so it can be reused for rebuilds
    const buildResponseToResult = (
      response: protocol.BuildResponse | null,
      callback: (
        error: types.BuildFailure | null,
        result: types.BuildResult | null,
        onEndErrors: types.Message[],
        onEndWarnings: types.Message[],
      ) => void,
    ): void => {
      const result: types.BuildResult = {
        errors: replaceDetailsInMessages(response!.errors, details),
        warnings: replaceDetailsInMessages(response!.warnings, details),
        outputFiles: undefined,
        metafile: undefined,
        mangleCache: undefined,
      }
      const originalErrors = result.errors.slice()
      const originalWarnings = result.warnings.slice()
      if (response!.outputFiles) {
        result.outputFiles = response!.outputFiles.map(convertOutputFiles)
      }
      if (response!.metafile && response!.metafile.length) {
        result.metafile = parseJSON(response!.metafile) as types.Metafile
      }
      if (response!.mangleCache) result.mangleCache = response!.mangleCache
      if (response!.writeToStdout !== void 0) {
        console.log(
          protocol.decodeUTF8(response!.writeToStdout).replace(/\n$/, ''),
        )
      }
      runOnEndCallbacks(result, (onEndErrors, onEndWarnings) => {
        if (originalErrors.length > 0 || onEndErrors.length > 0) {
          const error = failureErrorWithLog(
            'Build failed',
            originalErrors.concat(onEndErrors),
            originalWarnings.concat(onEndWarnings),
          )
          return callback(error, null, onEndErrors, onEndWarnings)
        }
        callback(null, result, onEndErrors, onEndWarnings)
      })
    }

    // In context mode, Go runs the "onEnd" callbacks instead of JavaScript
    let latestResultPromise: Promise<types.BuildResult> | undefined
    let provideLatestResult:
      | ((
        error: types.BuildFailure | null,
        result: types.BuildResult | null,
      ) => void)
      | undefined
    if (isContext) {
      requestCallbacks['on-end'] = (id, request: protocol.OnEndRequest) =>
        new Promise((resolve) => {
          buildResponseToResult(
            request,
            (err, result, onEndErrors, onEndWarnings) => {
              const response: protocol.OnEndResponse = {
                errors: onEndErrors,
                warnings: onEndWarnings,
              }
              if (provideLatestResult) provideLatestResult(err, result)
              latestResultPromise = undefined
              provideLatestResult = undefined
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
          return buildResponseToResult(response!, (err, res) => {
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
        let didDispose = false
        const result: types.BuildContext = {
          rebuild: () => {
            if (!latestResultPromise) {
              latestResultPromise = new Promise((resolve, reject) => {
                let settlePromise: (() => void) | undefined
                provideLatestResult = (err, result) => {
                  if (!settlePromise) {
                    settlePromise = () => err ? reject(err) : resolve(result!)
                  }
                }
                const triggerAnotherBuild = (): void => {
                  const request: protocol.RebuildRequest = {
                    command: 'rebuild',
                    key: buildKey,
                  }
                  sendRequest<
                    protocol.RebuildRequest,
                    protocol.RebuildResponse
                  >(
                    refs,
                    request,
                    (error, _response) => {
                      if (error) {
                        reject(new Error(error))
                      } else if (settlePromise) {
                        // It's possible to settle the promise that we returned from
                        // this "rebuild()" function earlier than this point. However,
                        // at that point the user could call "rebuild()" again which
                        // would unexpectedly merge with the same build that's still
                        // ongoing. To prevent that, we defer settling the promise
                        // until now when we know that the build has finished.
                        settlePromise()
                      } else {
                        // When we call "rebuild()", we call out to the Go "Rebuild()"
                        // API over IPC. That may trigger a build, but may also "join"
                        // an existing build. At some point the Go code sends us an
                        // "on-end" message with the build result to tell us to run
                        // our "onEnd" plugins. We capture that build result and return
                        // it here.
                        //
                        // However, there's a potential problem: For performance, the
                        // Go code will only send us the result if it's needed, which
                        // only happens if there are "onEnd" callbacks or if "rebuild"
                        // was called. So there's a race where the following things
                        // happen:
                        //
                        // 1. Go starts a rebuild (e.g. due to watch mode)
                        // 2. JS calls "rebuild()"
                        // 3. Go ends the build and starts Go's "OnEnd" callback
                        // 4. Go's "OnEnd" callback sees no need to send the result
                        // 5. JS asks Go to rebuild, which merges with the existing build
                        // 6. Go's existing build ends
                        // 7. The merged build ends, which wakes up JS and ends up here
                        //
                        // In that situation we didn't get an "on-end" message since
                        // Go thought it wasn't necessary. In that situation, we
                        // trigger another rebuild below so that Go will (almost
                        // surely) send us an "on-end" message next time. I suspect
                        // that this is a very rare case, so the performance impact
                        // of building twice shouldn't really matter. It also only
                        // happens when "rebuild()" is used with "watch()" and/or
                        // "serve()".
                        triggerAnotherBuild()
                      }
                    },
                  )
                }
                triggerAnotherBuild()
              })
            }
            return latestResultPromise
          },

          watch: (options = {}) =>
            new Promise((resolve, reject) => {
              if (!streamIn.hasFS) {
                throw new Error(
                  `Cannot use the "watch" API in this environment`,
                )
              }
              const keys: OptionKeys = {}
              const delay = getFlag(options, keys, 'delay', mustBeInteger)
              checkForInvalidFlags(options, keys, `in watch() call`)
              const request: protocol.WatchRequest = {
                command: 'watch',
                key: buildKey,
              }
              if (delay) request.delay = delay
              sendRequest<protocol.WatchRequest, null>(
                refs,
                request,
                (error) => {
                  if (error) reject(new Error(error))
                  else resolve(undefined)
                },
              )
            }),

          serve: (options = {}) =>
            new Promise((resolve, reject) => {
              if (!streamIn.hasFS) {
                throw new Error(
                  `Cannot use the "serve" API in this environment`,
                )
              }
              const keys: OptionKeys = {}
              const port = getFlag(
                options,
                keys,
                'port',
                mustBeValidPortNumber,
              )
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

              sendRequest<protocol.ServeRequest, protocol.ServeResponse>(
                refs,
                request,
                (error, response) => {
                  if (error) return reject(new Error(error))
                  if (onRequest) {
                    requestCallbacks['serve-request'] = (
                      id,
                      request: protocol.OnServeRequest,
                    ) => {
                      onRequest(request.args)
                      sendResponse(id, {})
                    }
                  }
                  resolve(response!)
                },
              )
            }),

          cancel: () =>
            new Promise((resolve) => {
              if (didDispose) return resolve()
              const request: protocol.CancelRequest = {
                command: 'cancel',
                key: buildKey,
              }
              sendRequest<protocol.CancelRequest, null>(refs, request, () => {
                resolve() // We don't care about errors here
              })
            }),

          dispose: () =>
            new Promise((resolve) => {
              if (didDispose) return resolve()
              didDispose = true // Don't dispose more than once
              const request: protocol.DisposeRequest = {
                command: 'dispose',
                key: buildKey,
              }
              sendRequest<protocol.DisposeRequest, null>(refs, request, () => {
                resolve() // We don't care about errors here
                scheduleOnDisposeCallbacks()

                // Only remove the reference here when we know the Go code has seen
                // this "dispose" call. We don't want to remove any registered
                // callbacks before that point because the Go code might still be
                // sending us events. If we remove the reference earlier then we
                // will return errors for those events, which may end up being
                // printed to the terminal where the user can see them, which would
                // be very confusing.
                refs.unref()
              })
            }),
        }
        refs.ref() // Keep a reference until "dispose" is called
        callback(null, result)
      },
    )
  }
}

export function convertOutputFiles(
  { path, contents, hash }: protocol.BuildOutputFile,
): types.OutputFile {
  // The text is lazily-generated for performance reasons. If no one asks for
  // it, then it never needs to be generated.
  let text: string | null = null
  return {
    path,
    contents,
    hash,
    get text() {
      // People want to be able to set "contents" and have esbuild automatically
      // derive "text" for them, so grab the contents off of this object instead
      // of using our original value.
      const binary = this.contents

      // This deliberately doesn't do bidirectional derivation because that could
      // result in the inefficiency. For example, if we did do this and then you
      // set "contents" and "text" and then asked for "contents", the second
      // setter for "text" will have erased our cached "contents" value so we'd
      // need to regenerate it again. Instead, "contents" is unambiguously the
      // primary value and "text" is unambiguously the derived value.
      if (text === null || binary !== contents) {
        contents = binary
        text = protocol.decodeUTF8(binary)
      }
      return text
    },
  }
}

export function parseJSON(bytes: Uint8Array): unknown {
  let text: string
  try {
    // This may fail in V8 with the error "Cannot create a string longer than
    // 0x1fffffe8 characters". Other JS engines may have similar limitations.
    text = protocol.decodeUTF8(bytes)
  } catch {
    // In that case, we attempt to parse the JSON ourselves directly from the
    // Uint8Array. This bypasses the string length limit as we no longer need
    // to construct a string that's the length of the input. However, doing
    // this is likely significantly slower (perhaps around ~4x slower?), so we
    // only do it if we have to.
    return JSON_parse(bytes)
  }
  return JSON.parse(text)
}
