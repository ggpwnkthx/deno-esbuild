/**
 * @module
 * Builds the `PluginBuild` object passed to a plugin's `setup` callback.
 *
 * The resolve closure and the five hook registrars (`onStart`, `onEnd`,
 * `onResolve`, `onLoad`, `onDispose`) are bundled here so the orchestrator
 * can stay focused on plugin iteration and validation.
 *
 * @see ./types.ts
 * @see ./request_callbacks.ts
 * @see ./handle_plugins.ts
 */
import type * as types from '../types/mod.ts'
import * as protocol from '../stdio_protocol/mod.ts'
import {
  canBeAnything,
  checkForInvalidFlags,
  getFlag,
  mustBeObject,
  mustBeRegExp,
  mustBeString,
  type OptionKeys,
} from '../validation.ts'
import { jsRegExpToGoRegExp } from '../regex.ts'
import { extractCallerV8 } from '../v8_stack.ts'
import { replaceDetailsInMessages, sanitizeStringMap } from '../message_sanitize.ts'
import type { CallbackRegistries } from './request_callbacks.ts'
import type { PluginStreamIn } from './types.ts'
import type { ObjectStash } from './object_stash.ts'

/** Inputs the {@link makePluginBuildObject} factory captures once and
 * threads through every registrar. */
interface PluginBuildContext {
  buildKey: number
  pluginName: string
  /** Plugin metadata the registrar populates as hooks register. */
  plugin: protocol.BuildPlugin
  registries: CallbackRegistries
  /** Shared stash the resolve closure uses to ferry `pluginData`. */
  details: ObjectStash
  streamIn: PluginStreamIn
  initialOptions: types.BuildOptions
  /** Set to `true` once setup completes; rejects `resolve()` calls before then. */
  isSetupDone: () => boolean
  sendRequest: <Req, Res>(
    refs: { ref(): void; unref(): void } | null,
    value: Req,
    callback: (error: string | null, response: Res | null) => void,
  ) => void
  refs: { ref(): void; unref(): void }
}

/** Builds the `PluginBuild` object the orchestrator hands to each plugin's
 * `setup` callback. The `resolve` closure and the five hook registrars close
 * over the supplied `PluginBuildContext` so they don't need to mutate
 * any out-of-band state. */
export function makePluginBuildObject(
  ctx: PluginBuildContext,
): types.PluginBuild {
  const {
    buildKey,
    pluginName,
    plugin,
    registries,
    details,
    streamIn,
    initialOptions,
    isSetupDone,
    sendRequest,
    refs,
  } = ctx

  const resolve = (
    path: string,
    options: types.ResolveOptions = {},
  ): Promise<types.ResolveResult> => {
    if (!isSetupDone()) {
      throw new Error(
        'Cannot call "resolve" before plugin setup has completed',
      )
    }
    if (typeof path !== 'string') {
      throw new Error(`The path to resolve must be a string`)
    }
    const keys: OptionKeys = Object.create(null)
    const optPluginName = getFlag(options, keys, 'pluginName', mustBeString)
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
        pluginName,
      }
      if (optPluginName != null) request.pluginName = optPluginName
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

  function noteFor(label: string) {
    return extractCallerV8(
      new Error(`This error came from the "${label}" callback registered here:`),
      streamIn,
      label,
    )
  }

  return {
    initialOptions,
    resolve,

    onStart(callback) {
      registries.onStart.push({
        name: pluginName,
        callback,
        note: noteFor('onStart'),
      })
      plugin.onStart = true
    },

    onEnd(callback) {
      registries.onEnd.push({
        name: pluginName,
        callback,
        note: noteFor('onEnd'),
      })
      plugin.onEnd = true
    },

    onResolve(options, callback) {
      const keys: OptionKeys = {}
      const filter = getFlag(options, keys, 'filter', mustBeRegExp)
      const namespace = getFlag(options, keys, 'namespace', mustBeString)
      checkForInvalidFlags(
        options,
        keys,
        `in onResolve() call for plugin ${JSON.stringify(pluginName)}`,
      )
      if (filter == null) {
        throw new Error(`onResolve() call is missing a filter`)
      }
      const id = registries.onResolveCounter.next()
      registries.onResolve[id] = {
        name: pluginName,
        callback,
        note: noteFor('onResolve'),
      }
      plugin.onResolve.push({
        id,
        filter: jsRegExpToGoRegExp(filter),
        namespace: namespace || '',
      })
    },

    onLoad(options, callback) {
      const keys: OptionKeys = {}
      const filter = getFlag(options, keys, 'filter', mustBeRegExp)
      const namespace = getFlag(options, keys, 'namespace', mustBeString)
      checkForInvalidFlags(
        options,
        keys,
        `in onLoad() call for plugin ${JSON.stringify(pluginName)}`,
      )
      if (filter == null) {
        throw new Error(`onLoad() call is missing a filter`)
      }
      const id = registries.onLoadCounter.next()
      registries.onLoad[id] = {
        name: pluginName,
        callback,
        note: noteFor('onLoad'),
      }
      plugin.onLoad.push({
        id,
        filter: jsRegExpToGoRegExp(filter),
        namespace: namespace || '',
      })
    },

    onDispose(callback) {
      registries.onDispose.push(callback)
    },

    esbuild: streamIn.esbuild,
  }
}

/** Monotonic id generator used for `onResolve` / `onLoad` callback ids. */
export function makeIdCounter(): { next: () => number } {
  let id = 0
  return { next: () => id++ }
}
