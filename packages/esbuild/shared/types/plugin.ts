/**
 * @module
 * Plugin API types: `Plugin`, `PluginBuild`, `ResolveOptions`,
 * `ResolveResult`, `OnStartResult`, `OnEndResult`, `OnResolveOptions`,
 * `OnResolveArgs`, `OnResolveResult`, `OnLoadOptions`, `OnLoadArgs`,
 * `OnLoadResult`, and `ImportKind`.
 *
 * @see ./build.ts
 * @see ./diagnostics.ts
 * @see https://esbuild.github.io/plugins/
 */
import type { BuildOptions, BuildResult } from './build.ts'

// The `api.ts` module declares the public function signatures that
// `PluginBuild.esbuild` references. We import them as types only so this
// module stays declaration-only.
import type {
  analyzeMetafile,
  analyzeMetafileSync,
  build,
  buildSync,
  context,
  formatMessages,
  formatMessagesSync,
  initialize,
  transform,
  transformSync,
  version,
} from './api.ts'

// Callback option/result types live in `./plugin_callbacks.ts`.
import type {
  OnEndResult,
  OnLoadArgs,
  OnLoadOptions,
  OnLoadResult,
  OnResolveArgs,
  OnResolveOptions,
  OnResolveResult,
  OnStartResult,
  ResolveOptions,
  ResolveResult,
} from './plugin_callbacks.ts'

/**
 * An esbuild plugin.
 *
 * @see https://esbuild.github.io/plugins/
 */
export interface Plugin {
  /** Unique name used in error messages and registry lookups. */
  name: string
  /** Callback invoked once per build to register hooks. */
  setup: (build: PluginBuild) => void | Promise<void>
}

/**
 * The plugin callback object passed to {@link Plugin.setup}.
 *
 * @see https://esbuild.github.io/plugins/
 */
export interface PluginBuild {
  /** Documentation: https://esbuild.github.io/plugins/#build-options */
  initialOptions: BuildOptions

  /** Documentation: https://esbuild.github.io/plugins/#resolve */
  resolve(path: string, options?: ResolveOptions): Promise<ResolveResult>

  /** Documentation: https://esbuild.github.io/plugins/#on-start */
  onStart(
    callback: () =>
      | OnStartResult
      | null
      | void
      | Promise<OnStartResult | null | void>,
  ): void

  /** Documentation: https://esbuild.github.io/plugins/#on-end */
  onEnd(
    callback: (
      result: BuildResult,
    ) => OnEndResult | null | void | Promise<OnEndResult | null | void>,
  ): void

  /** Documentation: https://esbuild.github.io/plugins/#on-resolve */
  onResolve(
    options: OnResolveOptions,
    callback: (
      args: OnResolveArgs,
    ) =>
      | OnResolveResult
      | null
      | undefined
      | Promise<OnResolveResult | null | undefined>,
  ): void

  /** Documentation: https://esbuild.github.io/plugins/#on-load */
  onLoad(
    options: OnLoadOptions,
    callback: (
      args: OnLoadArgs,
    ) =>
      | OnLoadResult
      | null
      | undefined
      | Promise<OnLoadResult | null | undefined>,
  ): void

  /** Documentation: https://esbuild.github.io/plugins/#on-dispose */
  onDispose(callback: () => void): void

  /**
   * Full copy of the esbuild library accessible from inside a plugin. Useful
   * for spawning nested builds without taking a dependency on the entry
   * module.
   */
  esbuild: {
    context: typeof context
    build: typeof build
    buildSync: typeof buildSync
    transform: typeof transform
    transformSync: typeof transformSync
    formatMessages: typeof formatMessages
    formatMessagesSync: typeof formatMessagesSync
    analyzeMetafile: typeof analyzeMetafile
    analyzeMetafileSync: typeof analyzeMetafileSync
    initialize: typeof initialize
    version: typeof version
  }
}

/**
 * The kind of import operation that triggered a resolve or load callback.
 *
 * @see https://esbuild.github.io/plugins/#resolve-options
 */
export type ImportKind =
  | 'entry-point'
  // JS
  | 'import-statement'
  | 'require-call'
  | 'dynamic-import'
  | 'require-resolve'
  // CSS
  | 'import-rule'
  | 'composes-from'
  | 'url-token'
