/**
 * @module
 * Plugin callback option/result types. Split out from {@link ./plugin.ts}
 * so the `Plugin` and `PluginBuild` core interfaces stay together with
 * `ImportKind`, and the larger callback family can evolve independently.
 *
 * @see ./plugin.ts
 * @see https://esbuild.github.io/plugins/
 */
import type { Loader } from './primitives.ts'
import type { Message, PartialMessage } from './diagnostics.ts'
import type { ImportKind } from './plugin.ts'

/** Documentation: https://esbuild.github.io/plugins/#resolve-options */
export interface ResolveOptions {
  /** Name of the plugin whose `onResolve` should perform the resolve. */
  pluginName?: string
  /** Importer path to use as the relative base for `path`. */
  importer?: string
  /** Loader namespace to resolve inside. */
  namespace?: string
  /** Directory used to resolve relative paths. */
  resolveDir?: string
  /** Kind of import that triggered the resolve call. */
  kind?: ImportKind
  /** Opaque per-call data the previous `onResolve` may have attached. */
  // deno-lint-ignore no-explicit-any
  pluginData?: any
  /** Import attributes (e.g. `{ type: "json" }`). */
  with?: Record<string, string>
}

/** Documentation: https://esbuild.github.io/plugins/#resolve-results */
export interface ResolveResult {
  /** Errors from the resolve call. */
  errors: Message[]
  /** Warnings from the resolve call. */
  warnings: Message[]

  /** Resolved path. */
  path: string
  /** Whether the resolved path should be treated as external. */
  external: boolean
  /** Whether the module has side effects (used for tree shaking). */
  sideEffects: boolean
  /** Loader namespace the resolved path belongs to. */
  namespace: string
  /** Suffix appended to the resolved path (e.g. `?query`). */
  suffix: string
  /** Opaque per-call data the next `onResolve` may consume. */
  // deno-lint-ignore no-explicit-any
  pluginData: any
}

/**
 * The value returned from an `onStart` plugin callback.
 *
 * @see https://esbuild.github.io/plugins/#on-start
 */
export interface OnStartResult {
  /** Errors to surface before the build begins. */
  errors?: PartialMessage[]
  /** Warnings to surface before the build begins. */
  warnings?: PartialMessage[]
}

/**
 * The value returned from an `onEnd` plugin callback.
 *
 * @see https://esbuild.github.io/plugins/#on-end
 */
export interface OnEndResult {
  /** Errors to surface after the build completes. */
  errors?: PartialMessage[]
  /** Warnings to surface after the build completes. */
  warnings?: PartialMessage[]
}

/** Documentation: https://esbuild.github.io/plugins/#on-resolve-options */
export interface OnResolveOptions {
  /** Regular expression tested against the import path. */
  filter: RegExp
  /** Loader namespace to listen on. */
  namespace?: string
}

/** Documentation: https://esbuild.github.io/plugins/#on-resolve-arguments */
export interface OnResolveArgs {
  /** Import path the resolve callback was triggered for. */
  path: string
  /** Importer path that issued the import (or empty for entry points). */
  importer: string
  /** Loader namespace the import originated from. */
  namespace: string
  /** Directory used to resolve relative paths. */
  resolveDir: string
  /** Kind of import that triggered the resolve call. */
  kind: ImportKind
  /** Opaque data attached by an earlier `onResolve` callback. */
  // deno-lint-ignore no-explicit-any
  pluginData: any
  /** Import attributes (e.g. `{ type: "json" }`). */
  with: Record<string, string>
}

/** Documentation: https://esbuild.github.io/plugins/#on-resolve-results */
export interface OnResolveResult {
  /** Name of the plugin claiming the resolved path. */
  pluginName?: string

  /** Errors to surface for this resolve attempt. */
  errors?: PartialMessage[]
  /** Warnings to surface for this resolve attempt. */
  warnings?: PartialMessage[]

  /** Resolved path produced by the plugin. */
  path?: string
  /** Whether the resolved path should be treated as external. */
  external?: boolean
  /** Whether the module has side effects (used for tree shaking). */
  sideEffects?: boolean
  /** Loader namespace the resolved path belongs to. */
  namespace?: string
  /** Suffix appended to the resolved path (e.g. `?query`). */
  suffix?: string
  /** Opaque data attached for the next `onResolve` callback. */
  // deno-lint-ignore no-explicit-any
  pluginData?: any

  /** Additional files to watch alongside the build. */
  watchFiles?: string[]
  /** Additional directories to watch alongside the build. */
  watchDirs?: string[]
}

/** Documentation: https://esbuild.github.io/plugins/#on-load-options */
export interface OnLoadOptions {
  /** Regular expression tested against the path. */
  filter: RegExp
  /** Loader namespace to listen on. */
  namespace?: string
}

/** Documentation: https://esbuild.github.io/plugins/#on-load-arguments */
export interface OnLoadArgs {
  /** Path the load callback was triggered for. */
  path: string
  /** Loader namespace the path belongs to. */
  namespace: string
  /** Suffix appended to the path (e.g. `?query`). */
  suffix: string
  /** Opaque data attached by an earlier `onResolve` callback. */
  // deno-lint-ignore no-explicit-any
  pluginData: any
  /** Import attributes (e.g. `{ type: "json" }`). */
  with: Record<string, string>
}

/** Documentation: https://esbuild.github.io/plugins/#on-load-results */
export interface OnLoadResult {
  /** Name of the plugin claiming the loaded content. */
  pluginName?: string

  /** Errors to surface during the load. */
  errors?: PartialMessage[]
  /** Warnings to surface during the load. */
  warnings?: PartialMessage[]

  /** Module contents to feed back into esbuild. */
  contents?: string | Uint8Array
  /** Directory used to resolve relative paths inside `contents`. */
  resolveDir?: string
  /** Loader used to interpret `contents`. */
  loader?: Loader
  /** Opaque data attached for downstream consumers. */
  // deno-lint-ignore no-explicit-any
  pluginData?: any

  /** Additional files to watch alongside the build. */
  watchFiles?: string[]
  /** Additional directories to watch alongside the build. */
  watchDirs?: string[]
}
