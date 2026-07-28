/**
 * @module
 * Plugin runtime: registers callbacks for the `onStart`, `onEnd`, `onResolve`,
 * `onLoad`, and `onDispose` hooks, validates plugin definitions, and wires
 * plugin callback results into the wire protocol.
 *
 * The implementation is split across the sibling modules in this directory:
 * - {@link ./object_stash.ts} — `ObjectStash` integer-id handoff.
 * - {@link ./types.ts} — `PluginStreamIn`, `RequestCallback`,
 *   `RunOnEndCallbacks`, `PluginMessageContext`, `HandlePluginsResult`,
 *   `HandlePluginsFailure`.
 * - {@link ./messages.ts} — `collectPluginMessages`, `exceptionToMessage`.
 * - {@link ./handle_plugins.ts} — `handlePlugins` orchestrator.
 *
 * The orchestrator in {@link ./handle_plugins.ts} consumes the user's
 * `Plugin[]` array and returns:
 * - `requestPlugins`: the protocol shape sent to the Go service.
 * - `runOnEndCallbacks`: a callback the transport runs after a build
 *   completes to gather `onEnd`-reported errors and warnings.
 * - `scheduleOnDisposeCallbacks`: a callback that fires `onDispose` callbacks
 *   on a fresh call stack once the build is fully done.
 *
 * This barrel keeps the historical `./plugin_runner.ts` import path
 * resolving to the same public surface.
 */
export type {
  HandlePluginsFailure,
  HandlePluginsResult,
  PluginMessageContext,
  PluginStreamIn,
  RequestCallback,
  RunOnEndCallbacks,
} from './types.ts'
export type { ObjectStash } from './object_stash.ts'
export { createObjectStash } from './object_stash.ts'
export { collectPluginMessages, exceptionToMessage } from './messages.ts'
export { handlePlugins } from './handle_plugins.ts'
