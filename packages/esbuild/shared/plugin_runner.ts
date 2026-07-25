/**
 * @module
 * Plugin runtime: registers callbacks for the `onStart`, `onEnd`, `onResolve`,
 * `onLoad`, and `onDispose` hooks, validates plugin definitions, and wires
 * plugin callback results into the wire protocol.
 *
 * The orchestrator in this module consumes the user's `Plugin[]` array and
 * returns:
 * - `requestPlugins`: the protocol shape sent to the Go service.
 * - `runOnEndCallbacks`: a callback the transport runs after a build
 *   completes to gather `onEnd`-reported errors and warnings.
 * - `scheduleOnDisposeCallbacks`: a callback that fires `onDispose` callbacks
 *   on a fresh call stack once the build is fully done.
 */
import type * as types from './types.ts'
import * as protocol from './stdio_protocol.ts'
import {
  canBeAnything,
  checkForInvalidFlags,
  getFlag,
  jsRegExpToGoRegExp,
  mustBeArrayOfStrings,
  mustBeBoolean,
  mustBeFunction,
  mustBeObject,
  mustBeRegExp,
  mustBeString,
  mustBeStringOrUint8Array,
  type OptionKeys,
} from './validation.ts'
import { extractCallerV8, extractErrorMessageV8, type StreamInLike } from './v8_stack.ts'
import {
  replaceDetailsInMessages,
  sanitizeMessages,
  sanitizeStringArray,
  sanitizeStringMap,
} from './message_sanitize.ts'

/**
 * Holds opaque JavaScript objects on the JS side so they can be passed
 * to the Go service (and back) as integers. Numbers travel for free; objects
 * don't. Each `store` call returns a fresh ID; `load(id)` returns the
 * original value. `clear()` is called between builds to bound memory.
 */
export interface ObjectStash {
  /** Drop every previously-stored value, freeing the underlying references. */
  clear(): void
  /** Look up a value previously stored under `id`. */
  load(id: number): unknown
  /** Store `value` and return the lookup id; `undefined` maps to id `-1`. */
  store(value: unknown): number
}

/**
 * Builds a fresh in-memory {@link ObjectStash} keyed by an auto-incrementing
 * integer. Each stash is short-lived and scoped to a single build.
 */
export function createObjectStash(): ObjectStash {
  const map = new Map<number, unknown>()
  let nextID = 0
  return {
    clear() {
      map.clear()
    },
    load(id) {
      return map.get(id)
    },
    store(value) {
      if (value === void 0) return -1
      const id = nextID++
      map.set(id, value)
      return id
    },
  }
}

/**
 * The `StreamIn` shape used by the plugin runner. Mirrors the full
 * {@link ../transport.ts:StreamIn} interface but narrowed to the fields the
 * plugin runner actually consumes; this keeps the dependency cycle between
 * the plugin runner and the transport tractable.
 */
export interface PluginStreamIn extends StreamInLike {
  /** Whether the host transport is synchronous (i.e. `buildSync`). */
  isSync: boolean
  /** Re-export of the full esbuild namespace passed to plugin callbacks. */
  esbuild: types.PluginBuild['esbuild']
}

/**
 * The middle tier of the build pipeline: a `handleRequest` callback that
 * wants to dispatch by command name needs a callback registry keyed by
 * command. Each plugin runner builds and owns one of these.
 */
// deno-lint-ignore no-explicit-any
export type RequestCallback = (id: number, request: any) => Promise<void> | void

/**
 * Signature the transport invokes after each build to run registered
 * `onEnd` hooks. The callback must call `done` so the transport can
 * surface the additional errors and warnings emitted by plugins.
 */
export type RunOnEndCallbacks = (
  result: types.BuildResult,
  done: (errors: types.Message[], warnings: types.Message[]) => void,
) => void

/**
 * Context for {@link collectPluginMessages}: the stash used to deduplicate
 * `detail` fields, the plugin name to attribute errors to, and a thunk that
 * returns the optional `Note` showing where the callback was registered.
 */
export interface PluginMessageContext {
  /** Stash used to deduplicate `detail` references across the build. */
  details: ObjectStash
  /** Name of the plugin these messages are attributed to. */
  name: string
  /** Stream shape used by the surrounding transport. */
  streamIn: PluginStreamIn
  /** Lazy accessor for the registration-site note. */
  note: (() => types.Note | undefined) | undefined
}

/**
 * Sanitizes the `errors` and `warnings` returns of a plugin callback result.
 * Returns `[errors, warnings]` where each element is either the sanitized
 * array or `undefined` if the callback returned nothing for that field.
 *
 * If the callback threw, the throw value is converted into a `types.Message`
 * via `extractErrorMessageV8` and surfaced as a single error.
 */
export function collectPluginMessages(
  result: unknown,
  ctx: PluginMessageContext,
  propertyWhere: string,
): {
  errors: types.Message[] | undefined
  warnings: types.Message[] | undefined
} {
  if (result == null) {
    return { errors: undefined, warnings: undefined }
  }
  if (typeof result !== 'object') {
    throw new Error(
      `Expected ${propertyWhere} to return an object`,
    )
  }
  const record = result as { [key: string]: unknown }
  const errors = (record.errors as unknown[] | undefined) ?? undefined
  const warnings = (record.warnings as unknown[] | undefined) ?? undefined
  return {
    errors: errors != null
      ? sanitizeMessages(
        errors as types.PartialMessage[],
        'errors',
        ctx.details,
        ctx.name,
        undefined,
      )
      : undefined,
    warnings: warnings != null
      ? sanitizeMessages(
        warnings as types.PartialMessage[],
        'warnings',
        ctx.details,
        ctx.name,
        undefined,
      )
      : undefined,
  }
}

/**
 * Converts an exception thrown by a plugin callback into a `types.Message`
 * with the registration `Note` attached. Mirrors the four `catch (e)` blocks
 * that previously lived at the call sites.
 */
export function exceptionToMessage(
  e: unknown,
  ctx: PluginMessageContext,
): types.Message {
  return extractErrorMessageV8(
    e,
    ctx.streamIn,
    ctx.details,
    ctx.note ? ctx.note() : undefined,
    ctx.name,
  )
}

/** Successful outcome of {@link handlePlugins}. */
export interface HandlePluginsResult {
  /** Discriminator that lets callers narrow to this shape. */
  ok: true
  /** Protocol shape sent to the Go service. */
  requestPlugins: protocol.BuildPlugin[]
  /** Callback the transport runs after a build to invoke `onEnd` hooks. */
  runOnEndCallbacks: RunOnEndCallbacks
  /** Schedule the per-plugin `onDispose` callbacks on a fresh call stack. */
  scheduleOnDisposeCallbacks: () => void
}

/** Failed outcome of {@link handlePlugins}. */
export interface HandlePluginsFailure {
  /** Discriminator that lets callers narrow to this shape. */
  ok: false
  /** Validation/setup error raised while iterating the plugin array. */
  error: Error
  /** Name of the plugin on which the error originated. */
  pluginName: string
}

/**
 * Registers `plugins` and dispatches their `onStart` / `onResolve` / `onLoad`
 * callbacks when the Go service asks for them. Side effects:
 *
 * - Populates `requestCallbacks` with the `on-start`, `on-resolve`, and
 *   `on-load` server-side callbacks.
 * - Returns a `requestPlugins` array consumed by the build request.
 * - Returns a `runOnEndCallbacks` function that runs the `onEnd` hooks after
 *   the build finishes.
 * - Returns a `scheduleOnDisposeCallbacks` function that fires `onDispose`
 *   hooks on a fresh call stack.
 */
export async function handlePlugins(
  buildKey: number,
  sendRequest: <Req, Res>(
    refs: { ref(): void; unref(): void } | null,
    value: Req,
    callback: (error: string | null, response: Res | null) => void,
  ) => void,
  sendResponse: (id: number, value: protocol.Value) => void,
  refs: { ref(): void; unref(): void },
  streamIn: PluginStreamIn,
  requestCallbacks: { [command: string]: RequestCallback },
  initialOptions: types.BuildOptions,
  plugins: types.Plugin[],
  details: ObjectStash,
): Promise<HandlePluginsResult | HandlePluginsFailure> {
  const onStartCallbacks: {
    name: string
    note: () => types.Note | undefined
    callback: () =>
      | types.OnStartResult
      | null
      | void
      | Promise<types.OnStartResult | null | void>
  }[] = []

  const onEndCallbacks: {
    name: string
    note: () => types.Note | undefined
    callback: (
      result: types.BuildResult,
    ) =>
      | types.OnEndResult
      | null
      | void
      | Promise<types.OnEndResult | null | void>
  }[] = []

  const onResolveCallbacks: {
    [id: number]: {
      name: string
      note: () => types.Note | undefined
      callback: (
        args: types.OnResolveArgs,
      ) =>
        | types.OnResolveResult
        | null
        | undefined
        | Promise<types.OnResolveResult | null | undefined>
    }
  } = {}

  const onLoadCallbacks: {
    [id: number]: {
      name: string
      note: () => types.Note | undefined
      callback: (
        args: types.OnLoadArgs,
      ) =>
        | types.OnLoadResult
        | null
        | undefined
        | Promise<types.OnLoadResult | null | undefined>
    }
  } = {}

  const onDisposeCallbacks: (() => void)[] = []
  let nextCallbackID = 0
  let i = 0
  const requestPlugins: protocol.BuildPlugin[] = []
  let isSetupDone = false

  // Clone the plugin array to guard against mutation during iteration
  plugins = [...plugins]

  for (const item of plugins) {
    const keys: OptionKeys = {}
    if (typeof item !== 'object') {
      throw new Error(`Plugin at index ${i} must be an object`)
    }
    const name = getFlag(item, keys, 'name', mustBeString)
    if (typeof name !== 'string' || name === '') {
      throw new Error(`Plugin at index ${i} is missing a name`)
    }
    try {
      const setup = getFlag(
        item,
        keys,
        'setup',
        mustBeFunction as (value: unknown) => string | null,
      )
      if (typeof setup !== 'function') {
        throw new Error(`Plugin is missing a setup function`)
      }
      checkForInvalidFlags(item, keys, `on plugin ${JSON.stringify(name)}`)

      const plugin: protocol.BuildPlugin = {
        name,
        onStart: false,
        onEnd: false,
        onResolve: [],
        onLoad: [],
      }
      i++

      const resolve = (
        path: string,
        options: types.ResolveOptions = {},
      ): Promise<types.ResolveResult> => {
        if (!isSetupDone) {
          throw new Error(
            'Cannot call "resolve" before plugin setup has completed',
          )
        }
        if (typeof path !== 'string') {
          throw new Error(`The path to resolve must be a string`)
        }
        const keys: OptionKeys = Object.create(null)
        const pluginName = getFlag(options, keys, 'pluginName', mustBeString)
        const importer = getFlag(options, keys, 'importer', mustBeString)
        const namespace = getFlag(options, keys, 'namespace', mustBeString)
        const resolveDir = getFlag(options, keys, 'resolveDir', mustBeString)
        const kind = getFlag(options, keys, 'kind', mustBeString)
        const pluginData = getFlag(options, keys, 'pluginData', canBeAnything)
        const importAttributes = getFlag(options, keys, 'with', mustBeObject)
        checkForInvalidFlags(options, keys, 'in resolve() call')

        return new Promise((resolve, reject) => {
          const request: protocol.ResolveRequest = {
            command: 'resolve',
            path,
            key: buildKey,
            pluginName: name,
          }
          if (pluginName != null) request.pluginName = pluginName
          if (importer != null) request.importer = importer
          if (namespace != null) request.namespace = namespace
          if (resolveDir != null) request.resolveDir = resolveDir
          if (kind != null) request.kind = kind
          else throw new Error(`Must specify "kind" when calling "resolve"`)
          if (pluginData != null) {
            request.pluginData = details.store(pluginData)
          }
          if (importAttributes != null) {
            request.with = sanitizeStringMap(importAttributes, 'with')
          }

          sendRequest<protocol.ResolveRequest, protocol.ResolveResponse>(
            refs,
            request,
            (error, response) => {
              if (error !== null) reject(new Error(error))
              else {
                resolve({
                  errors: replaceDetailsInMessages(response!.errors, details),
                  warnings: replaceDetailsInMessages(
                    response!.warnings,
                    details,
                  ),
                  path: response!.path,
                  external: response!.external,
                  sideEffects: response!.sideEffects,
                  namespace: response!.namespace,
                  suffix: response!.suffix,
                  pluginData: details.load(response!.pluginData),
                })
              }
            },
          )
        })
      }

      const promise = setup({
        initialOptions,

        resolve,

        onStart(callback) {
          const registeredText = `This error came from the "onStart" callback registered here:`
          const registeredNote = extractCallerV8(
            new Error(registeredText),
            streamIn,
            'onStart',
          )
          onStartCallbacks.push({
            name: name!,
            callback,
            note: registeredNote,
          })
          plugin.onStart = true
        },

        onEnd(callback) {
          const registeredText = `This error came from the "onEnd" callback registered here:`
          const registeredNote = extractCallerV8(
            new Error(registeredText),
            streamIn,
            'onEnd',
          )
          onEndCallbacks.push({ name: name!, callback, note: registeredNote })
          plugin.onEnd = true
        },

        onResolve(options, callback) {
          const registeredText = `This error came from the "onResolve" callback registered here:`
          const registeredNote = extractCallerV8(
            new Error(registeredText),
            streamIn,
            'onResolve',
          )
          const keys: OptionKeys = {}
          const filter = getFlag(options, keys, 'filter', mustBeRegExp)
          const namespace = getFlag(options, keys, 'namespace', mustBeString)
          checkForInvalidFlags(
            options,
            keys,
            `in onResolve() call for plugin ${JSON.stringify(name)}`,
          )
          if (filter == null) {
            throw new Error(`onResolve() call is missing a filter`)
          }
          const id = nextCallbackID++
          onResolveCallbacks[id] = {
            name: name!,
            callback,
            note: registeredNote,
          }
          plugin.onResolve.push({
            id,
            filter: jsRegExpToGoRegExp(filter),
            namespace: namespace || '',
          })
        },

        onLoad(options, callback) {
          const registeredText = `This error came from the "onLoad" callback registered here:`
          const registeredNote = extractCallerV8(
            new Error(registeredText),
            streamIn,
            'onLoad',
          )
          const keys: OptionKeys = {}
          const filter = getFlag(options, keys, 'filter', mustBeRegExp)
          const namespace = getFlag(options, keys, 'namespace', mustBeString)
          checkForInvalidFlags(
            options,
            keys,
            `in onLoad() call for plugin ${JSON.stringify(name)}`,
          )
          if (filter == null) {
            throw new Error(`onLoad() call is missing a filter`)
          }
          const id = nextCallbackID++
          onLoadCallbacks[id] = { name: name!, callback, note: registeredNote }
          plugin.onLoad.push({
            id,
            filter: jsRegExpToGoRegExp(filter),
            namespace: namespace || '',
          })
        },

        onDispose(callback) {
          onDisposeCallbacks.push(callback)
        },

        esbuild: streamIn.esbuild,
      })

      // Await a returned promise if there was one. This allows plugins to do
      // some asynchronous setup while still retaining the ability to modify
      // the build options. This deliberately serializes asynchronous plugin
      // setup instead of running them concurrently so that build option
      // modifications are easier to reason about.
      if (promise) await promise

      requestPlugins.push(plugin)
    } catch (e) {
      return { ok: false, error: e as Error, pluginName: name }
    }
  }

  requestCallbacks['on-start'] = async (
    id,
    _request: protocol.OnStartRequest,
  ) => {
    // Reset the "pluginData" map before each new build to avoid a memory leak.
    // This is done before each new build begins instead of after each build ends
    // because I believe the current API doesn't restrict when you can call
    // "resolve" and there may be some uses of it that call it around when the
    // build ends, and we don't want to accidentally break those use cases.
    details.clear()

    const response: protocol.OnStartResponse = { errors: [], warnings: [] }
    await Promise.all(onStartCallbacks.map(async ({ name, callback, note }) => {
      const ctx: PluginMessageContext = {
        details,
        name,
        streamIn,
        note,
      }
      try {
        const result = await callback()
        const { errors, warnings } = collectPluginMessages(
          result,
          ctx,
          `from onStart() callback in plugin ${JSON.stringify(name)}`,
        )
        if (errors) response.errors!.push(...errors)
        if (warnings) response.warnings!.push(...warnings)
      } catch (e) {
        response.errors!.push(exceptionToMessage(e, ctx))
      }
    }))
    sendResponse(id, response as protocol.Value)
  }

  requestCallbacks['on-resolve'] = async (
    id,
    request: protocol.OnResolveRequest,
  ) => {
    let response: protocol.OnResolveResponse = {}, name = '', callback, note
    for (const id of request.ids) {
      try {
        ;({ name, callback, note } = onResolveCallbacks[id]!)
        const result = await callback({
          path: request.path,
          importer: request.importer,
          namespace: request.namespace,
          resolveDir: request.resolveDir,
          kind: request.kind,
          pluginData: details.load(request.pluginData),
          with: request.with,
        })

        if (result != null) {
          if (typeof result !== 'object') {
            throw new Error(
              `Expected onResolve() callback in plugin ${JSON.stringify(name)} to return an object`,
            )
          }
          const keys: OptionKeys = {}
          const pluginName = getFlag(result, keys, 'pluginName', mustBeString)
          const path = getFlag(result, keys, 'path', mustBeString)
          const namespace = getFlag(result, keys, 'namespace', mustBeString)
          const suffix = getFlag(result, keys, 'suffix', mustBeString)
          const external = getFlag(result, keys, 'external', mustBeBoolean)
          const sideEffects = getFlag(
            result,
            keys,
            'sideEffects',
            mustBeBoolean,
          )
          const pluginData = getFlag(result, keys, 'pluginData', canBeAnything)
          const watchFiles = getFlag(
            result,
            keys,
            'watchFiles',
            mustBeArrayOfStrings,
          )
          const watchDirs = getFlag(
            result,
            keys,
            'watchDirs',
            mustBeArrayOfStrings,
          )
          checkForInvalidFlags(
            result,
            keys,
            `from onResolve() callback in plugin ${JSON.stringify(name)}`,
          )

          response.id = id
          if (pluginName != null) response.pluginName = pluginName
          if (path != null) response.path = path
          if (namespace != null) response.namespace = namespace
          if (suffix != null) response.suffix = suffix
          if (external != null) response.external = external
          if (sideEffects != null) response.sideEffects = sideEffects
          if (pluginData != null) {
            response.pluginData = details.store(pluginData)
          }
          if (watchFiles != null) {
            response.watchFiles = sanitizeStringArray(watchFiles, 'watchFiles')
          }
          if (watchDirs != null) {
            response.watchDirs = sanitizeStringArray(watchDirs, 'watchDirs')
          }
          const messages = collectPluginMessages(
            result,
            { details, name, streamIn, note },
            `from onResolve() callback in plugin ${JSON.stringify(name)}`,
          )
          if (messages.errors) response.errors = messages.errors
          if (messages.warnings) response.warnings = messages.warnings
          break
        }
      } catch (e) {
        response = {
          id,
          errors: [
            exceptionToMessage(e, { details, name, streamIn, note }),
          ],
        }
        break
      }
    }
    sendResponse(id, response as protocol.Value)
  }

  requestCallbacks['on-load'] = async (id, request: protocol.OnLoadRequest) => {
    let response: protocol.OnLoadResponse = {}, name = '', callback, note
    for (const id of request.ids) {
      try {
        ;({ name, callback, note } = onLoadCallbacks[id]!)
        const result = await callback({
          path: request.path,
          namespace: request.namespace,
          suffix: request.suffix,
          pluginData: details.load(request.pluginData),
          with: request.with,
        })

        if (result != null) {
          if (typeof result !== 'object') {
            throw new Error(
              `Expected onLoad() callback in plugin ${JSON.stringify(name)} to return an object`,
            )
          }
          const keys: OptionKeys = {}
          const pluginName = getFlag(result, keys, 'pluginName', mustBeString)
          const contents = getFlag(
            result,
            keys,
            'contents',
            mustBeStringOrUint8Array,
          )
          const resolveDir = getFlag(result, keys, 'resolveDir', mustBeString)
          const pluginData = getFlag(result, keys, 'pluginData', canBeAnything)
          const loader = getFlag(result, keys, 'loader', mustBeString)
          const watchFiles = getFlag(
            result,
            keys,
            'watchFiles',
            mustBeArrayOfStrings,
          )
          const watchDirs = getFlag(
            result,
            keys,
            'watchDirs',
            mustBeArrayOfStrings,
          )
          checkForInvalidFlags(
            result,
            keys,
            `from onLoad() callback in plugin ${JSON.stringify(name)}`,
          )

          response.id = id
          if (pluginName != null) response.pluginName = pluginName
          if (contents instanceof Uint8Array) response.contents = contents
          else if (contents != null) {
            response.contents = protocol.encodeUTF8(contents)
          }
          if (resolveDir != null) response.resolveDir = resolveDir
          if (pluginData != null) {
            response.pluginData = details.store(pluginData)
          }
          if (loader != null) response.loader = loader
          if (watchFiles != null) {
            response.watchFiles = sanitizeStringArray(watchFiles, 'watchFiles')
          }
          if (watchDirs != null) {
            response.watchDirs = sanitizeStringArray(watchDirs, 'watchDirs')
          }
          const messages = collectPluginMessages(
            result,
            { details, name, streamIn, note },
            `from onLoad() callback in plugin ${JSON.stringify(name)}`,
          )
          if (messages.errors) response.errors = messages.errors
          if (messages.warnings) response.warnings = messages.warnings
          break
        }
      } catch (e) {
        response = {
          id,
          errors: [
            exceptionToMessage(e, { details, name, streamIn, note }),
          ],
        }
        break
      }
    }
    sendResponse(id, response as protocol.Value)
  }

  let runOnEndCallbacks: RunOnEndCallbacks = (_result, done) => done([], [])

  if (onEndCallbacks.length > 0) {
    runOnEndCallbacks = (result, done) => {
      ;(async () => {
        const onEndErrors: types.Message[] = []
        const onEndWarnings: types.Message[] = []

        for (const { name, callback, note } of onEndCallbacks) {
          let newErrors: types.Message[] | undefined
          let newWarnings: types.Message[] | undefined

          try {
            const value = await callback(result)
            const messages = collectPluginMessages(
              value,
              { details, name, streamIn, note },
              `from onEnd() callback in plugin ${JSON.stringify(name)}`,
            )
            newErrors = messages.errors
            newWarnings = messages.warnings
          } catch (e) {
            newErrors = [
              exceptionToMessage(e, { details, name, streamIn, note }),
            ]
          }

          // Try adding the errors and warnings to the result object, but
          // continue if something goes wrong. If error-reporting has errors
          // then nothing can help us...
          if (newErrors) {
            onEndErrors.push(...newErrors)
            try {
              result.errors.push(...newErrors)
            } catch {
              // Ignore errors when adding errors (e.g., if errors is frozen)
            }
          }
          if (newWarnings) {
            onEndWarnings.push(...newWarnings)
            try {
              result.warnings.push(...newWarnings)
            } catch {
              // Ignore errors when adding warnings (e.g., if warnings is frozen)
            }
          }
        }

        done(onEndErrors, onEndWarnings)
      })()
    }
  }

  const scheduleOnDisposeCallbacks = (): void => {
    // Run each "onDispose" callback with its own call stack
    for (const cb of onDisposeCallbacks) {
      setTimeout(() => cb(), 0)
    }
  }

  isSetupDone = true
  return {
    ok: true,
    requestPlugins,
    runOnEndCallbacks,
    scheduleOnDisposeCallbacks,
  }
}
