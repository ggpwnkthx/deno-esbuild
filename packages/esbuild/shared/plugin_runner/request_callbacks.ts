/**
 * @module
 * Server-side request-callback bodies invoked when the esbuild Go service
 * asks the host to run an `on-start`, `on-resolve`, or `on-load` callback,
 * plus the `runOnEndCallbacks` and `scheduleOnDisposeCallbacks` builders.
 *
 * The orchestrator in {@link ./handle_plugins.ts} collects plugin
 * registrations into a {@link CallbackRegistries} bundle, then hands that
 * bundle to the factory functions in this directory to build the
 * request-callback handlers and lifecycle hooks.
 *
 * @see ./types.ts
 * @see ./messages.ts
 * @see ./object_stash.ts
 * @see ./handle_plugins.ts
 * @see ./on_start.ts
 * @see ./on_resolve.ts
 * @see ./on_load.ts
 * @see ./lifecycle.ts
 */
import type * as types from '../types/mod.ts'
import type { ObjectStash } from './object_stash.ts'

/** Per-callback registration entry stored under the orchestrator's lookup
 * tables for the `onStart`, `onEnd`, `onResolve`, and `onLoad` hooks. */
export interface CallbackEntry<Cb> {
  name: string
  note: () => types.Note | undefined
  callback: Cb
}

/** Bundles the four registration tables so the request-callback factories
 * can be invoked with a single argument. */
export interface CallbackRegistries {
  onStart: CallbackEntry<
    () =>
      | types.OnStartResult
      | null
      | void
      | Promise<types.OnStartResult | null | void>
  >[]
  onEnd: CallbackEntry<
    (
      result: types.BuildResult,
    ) =>
      | types.OnEndResult
      | null
      | void
      | Promise<types.OnEndResult | null | void>
  >[]
  onResolve: {
    [id: number]: CallbackEntry<
      (
        args: types.OnResolveArgs,
      ) =>
        | types.OnResolveResult
        | null
        | undefined
        | Promise<types.OnResolveResult | null | undefined>
    >
  }
  onLoad: {
    [id: number]: CallbackEntry<
      (
        args: types.OnLoadArgs,
      ) =>
        | types.OnLoadResult
        | null
        | undefined
        | Promise<types.OnLoadResult | null | undefined>
    >
  }
  onDispose: (() => void)[]
  /** Monotonic id allocator for `onResolve` callbacks. */
  onResolveCounter: { next: () => number }
  /** Monotonic id allocator for `onLoad` callbacks. */
  onLoadCounter: { next: () => number }
}

/** Just the closure state shared by the request-callback factories, so they
 * can be passed as a single argument. */
export interface RequestCallbackContext {
  details: ObjectStash
  registries: CallbackRegistries
  streamIn: import('./types.ts').PluginStreamIn
  sendResponse: (id: number, value: import('../stdio_protocol/mod.ts').Value) => void
}
