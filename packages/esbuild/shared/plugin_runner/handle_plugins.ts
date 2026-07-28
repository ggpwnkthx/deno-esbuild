/**
 * @module
 * Plugin orchestrator. Registers plugin `setup` callbacks, validates their
 * options, wires the resulting hook registrations into the wire protocol,
 * and provides the `requestPlugins` / `runOnEndCallbacks` /
 * `scheduleOnDisposeCallbacks` trio the transport consumes.
 *
 * The orchestrator collects plugin registrations into a {@link CallbackRegistries}
 * bundle, then hands that bundle to the factory functions in this directory
 * to build the request-callback handlers and lifecycle hooks. The per-plugin
 * setup object (the `PluginBuild` argument passed to each plugin's
 * `setup`) is built by {@link ./plugin_setup.ts:makePluginBuildObject}.
 *
 * @see ./types.ts
 * @see ./messages.ts
 * @see ./object_stash.ts
 * @see ./request_callbacks.ts
 * @see ./on_start.ts
 * @see ./on_resolve.ts
 * @see ./on_load.ts
 * @see ./lifecycle.ts
 * @see ./plugin_setup.ts
 */
import type * as types from '../types/mod.ts'
import * as protocol from '../stdio_protocol/mod.ts'
import {
  checkForInvalidFlags,
  getFlag,
  mustBeFunction,
  mustBeString,
  type OptionKeys,
} from '../validation.ts'
import type { ObjectStash } from './object_stash.ts'
import type { CallbackRegistries, RequestCallbackContext } from './request_callbacks.ts'
import { makeIdCounter } from './plugin_setup.ts'
import type {
  HandlePluginsFailure,
  HandlePluginsResult,
  PluginStreamIn,
  RequestCallback,
} from './types.ts'
import { makeOnStartHandler } from './on_start.ts'
import { makeOnResolveHandler } from './on_resolve.ts'
import { makeOnLoadHandler } from './on_load.ts'
import { makeRunOnEndCallbacks, makeScheduleOnDisposeCallbacks } from './lifecycle.ts'
import { makePluginBuildObject } from './plugin_setup.ts'

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
  const registries: CallbackRegistries = {
    onStart: [],
    onEnd: [],
    onResolve: {},
    onLoad: {},
    onDispose: [],
    onResolveCounter: makeIdCounter(),
    onLoadCounter: makeIdCounter(),
  }
  const requestPlugins: protocol.BuildPlugin[] = []
  let isSetupDone = false

  // Clone the plugin array to guard against mutation during iteration
  plugins = [...plugins]

  for (let i = 0; i < plugins.length; i++) {
    const item = plugins[i]
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

      const buildObject = makePluginBuildObject({
        buildKey,
        pluginName: name,
        plugin,
        registries,
        details,
        streamIn,
        initialOptions,
        isSetupDone: () => isSetupDone,
        sendRequest,
        refs,
      })

      // Await a returned promise if there was one. This allows plugins to do
      // some asynchronous setup while still retaining the ability to modify
      // the build options. This deliberately serializes asynchronous plugin
      // setup instead of running them concurrently so that build option
      // modifications are easier to reason about.
      const promise = setup(buildObject)
      if (promise) await promise

      requestPlugins.push(plugin)
    } catch (e) {
      return { ok: false, error: e as Error, pluginName: name }
    }
  }

  const callbackCtx: RequestCallbackContext = {
    details,
    registries,
    streamIn,
    sendResponse,
  }
  requestCallbacks['on-start'] = makeOnStartHandler(callbackCtx)
  requestCallbacks['on-resolve'] = makeOnResolveHandler(callbackCtx)
  requestCallbacks['on-load'] = makeOnLoadHandler(callbackCtx)

  const runOnEndCallbacks = makeRunOnEndCallbacks(registries, details, streamIn)
  const scheduleOnDisposeCallbacks = makeScheduleOnDisposeCallbacks(registries)

  isSetupDone = true
  return {
    ok: true,
    requestPlugins,
    runOnEndCallbacks,
    scheduleOnDisposeCallbacks,
  }
}
