/**
 * @module
 * Type declarations for the plugin runner surface.
 *
 * @see ./object_stash.ts
 * @see ./handle_plugins.ts
 * @see ../v8_stack.ts
 * @see ../types.ts
 */
import type * as types from '../types/mod.ts'
import type { ObjectStash } from './object_stash.ts'
import type { StreamInLike } from '../v8_stack.ts'

/**
 * The `StreamIn` shape used by the plugin runner. Mirrors the full
 * `StreamIn` interface from `../transport.ts` but narrowed to the fields the
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
 * Context for {@link ./messages.ts:collectPluginMessages}: the stash used to
 * deduplicate `detail` fields, the plugin name to attribute errors to, and a
 * thunk that returns the optional `Note` showing where the callback was
 * registered.
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

/** Successful outcome of {@link ./handle_plugins.ts:handlePlugins}. */
export interface HandlePluginsResult {
  /** Discriminator that lets callers narrow to this shape. */
  ok: true
  /** Protocol shape sent to the Go service. */
  requestPlugins: import('../stdio_protocol/mod.ts').BuildPlugin[]
  /** Callback the transport runs after a build to invoke `onEnd` hooks. */
  runOnEndCallbacks: RunOnEndCallbacks
  /** Schedule the per-plugin `onDispose` callbacks on a fresh call stack. */
  scheduleOnDisposeCallbacks: () => void
}

/** Failed outcome of {@link ./handle_plugins.ts:handlePlugins}. */
export interface HandlePluginsFailure {
  /** Discriminator that lets callers narrow to this shape. */
  ok: false
  /** Validation/setup error raised while iterating the plugin array. */
  error: Error
  /** Name of the plugin on which the error originated. */
  pluginName: string
}
