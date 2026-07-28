/**
 * @module
 * Build configuration types: `BuildOptions`, `StdinOptions`, `OutputFile`,
 * `BuildResult`, `BuildFailure`, `BuildContext`, and `WatchOptions`.
 *
 * @see ./common.ts
 * @see ./diagnostics.ts
 * @see ./serve.ts
 * @see ./plugin.ts
 * @see https://esbuild.github.io/api/#general-options
 */
import type { Message } from './diagnostics.ts'
import type { Loader } from './primitives.ts'
import type { Metafile } from './metafile.ts'
import type { Plugin } from './plugin.ts'
import type { ServeOptions, ServeResult } from './serve.ts'

// Importing the interface directly (not via `import type`) so the
// `extends CommonOptions` reference resolves at compile time.
import type { CommonOptions } from './common.ts'

/**
 * Options for configuring a single esbuild build.
 *
 * @see https://esbuild.github.io/api/#general-options
 */
export interface BuildOptions extends CommonOptions {
  /** Documentation: https://esbuild.github.io/api/#bundle */
  bundle?: boolean
  /** Documentation: https://esbuild.github.io/api/#splitting */
  splitting?: boolean
  /** Documentation: https://esbuild.github.io/api/#preserve-symlinks */
  preserveSymlinks?: boolean
  /** Documentation: https://esbuild.github.io/api/#outfile */
  outfile?: string
  /** Documentation: https://esbuild.github.io/api/#metafile */
  metafile?: boolean
  /** Documentation: https://esbuild.github.io/api/#outdir */
  outdir?: string
  /** Documentation: https://esbuild.github.io/api/#outbase */
  outbase?: string
  /** Documentation: https://esbuild.github.io/api/#external */
  external?: string[]
  /** Documentation: https://esbuild.github.io/api/#packages */
  packages?: 'bundle' | 'external'
  /** Documentation: https://esbuild.github.io/api/#alias */
  alias?: Record<string, string>
  /** Documentation: https://esbuild.github.io/api/#loader */
  loader?: { [ext: string]: Loader }
  /** Documentation: https://esbuild.github.io/api/#resolve-extensions */
  resolveExtensions?: string[]
  /** Documentation: https://esbuild.github.io/api/#main-fields */
  mainFields?: string[]
  /** Documentation: https://esbuild.github.io/api/#conditions */
  conditions?: string[]
  /** Documentation: https://esbuild.github.io/api/#write */
  write?: boolean
  /** Documentation: https://esbuild.github.io/api/#allow-overwrite */
  allowOverwrite?: boolean
  /** Documentation: https://esbuild.github.io/api/#tsconfig */
  tsconfig?: string
  /** Documentation: https://esbuild.github.io/api/#out-extension */
  outExtension?: { [ext: string]: string }
  /** Documentation: https://esbuild.github.io/api/#public-path */
  publicPath?: string
  /** Documentation: https://esbuild.github.io/api/#entry-names */
  entryNames?: string
  /** Documentation: https://esbuild.github.io/api/#chunk-names */
  chunkNames?: string
  /** Documentation: https://esbuild.github.io/api/#asset-names */
  assetNames?: string
  /** Documentation: https://esbuild.github.io/api/#inject */
  inject?: string[]
  /** Documentation: https://esbuild.github.io/api/#banner */
  banner?: { [type: string]: string }
  /** Documentation: https://esbuild.github.io/api/#footer */
  footer?: { [type: string]: string }
  /** Documentation: https://esbuild.github.io/api/#entry-points */
  entryPoints?:
    | (string | { in: string; out: string })[]
    | Record<string, string>
  /** Documentation: https://esbuild.github.io/api/#stdin */
  stdin?: StdinOptions
  /** Documentation: https://esbuild.github.io/plugins/ */
  plugins?: Plugin[]
  /** Documentation: https://esbuild.github.io/api/#working-directory */
  absWorkingDir?: string
  /** Documentation: https://esbuild.github.io/api/#node-paths */
  nodePaths?: string[] // The "NODE_PATH" variable from Node.js
}

/**
 * Options for configuring how an entry point is read from stdin.
 *
 * @see https://esbuild.github.io/api/#stdin
 */
export interface StdinOptions {
  /** Source code to use as the implicit entry point. */
  contents: string | Uint8Array
  /** Directory used to resolve relative paths inside `contents`. */
  resolveDir?: string
  /** Synthetic filename reported to plugins and source maps. */
  sourcefile?: string
  /** Loader used to interpret `contents`. */
  loader?: Loader
}

/**
 * A single output file produced by a build with `write: false`.
 *
 * @see https://esbuild.github.io/api/#write
 */
export interface OutputFile {
  /** Absolute path of the generated output file. */
  path: string
  /** Raw bytes of the generated output file. */
  contents: Uint8Array
  /** Short content hash for cache-busting query strings. */
  hash: string
  /** "contents" as text (changes automatically with "contents") */
  readonly text: string
}

/**
 * The result of a successful esbuild build.
 *
 * @see https://esbuild.github.io/api/#return-values
 */
export interface BuildResult<
  ProvidedOptions extends BuildOptions = BuildOptions,
> {
  /** Recoverable errors collected during the build. */
  errors: Message[]
  /** Recoverable warnings collected during the build. */
  warnings: Message[]
  /** Only when "write: false" */
  outputFiles:
    | OutputFile[]
    | (ProvidedOptions['write'] extends false ? never : undefined)
  /** Only when "metafile: true" */
  metafile:
    | Metafile
    | (ProvidedOptions['metafile'] extends true ? never : undefined)
  /** Only when "mangleCache" is present */
  mangleCache:
    | Record<string, string | false>
    | (ProvidedOptions['mangleCache'] extends object ? never : undefined)
}

/**
 * The error value rejected from a failed esbuild build.
 *
 * @see https://esbuild.github.io/api/#return-values
 */
export interface BuildFailure extends Error {
  /** Errors that caused the build to fail. */
  errors: Message[]
  /** Warnings collected before the build failed. */
  warnings: Message[]
}

/**
 * Options for the watch mode ({@link BuildContext.watch}).
 *
 * @see https://esbuild.github.io/api/#watch
 */
export interface WatchOptions {
  /** Throttle delay between watch rebuilds, in milliseconds. */
  delay?: number // In milliseconds
}

/**
 * A long-running esbuild build context, returned from the `context` API.
 *
 * @see https://esbuild.github.io/api/#build
 */
export interface BuildContext<
  ProvidedOptions extends BuildOptions = BuildOptions,
> {
  /** Documentation: https://esbuild.github.io/api/#rebuild */
  rebuild(): Promise<BuildResult<ProvidedOptions>>

  /** Documentation: https://esbuild.github.io/api/#watch */
  watch(options?: WatchOptions): Promise<void>

  /** Documentation: https://esbuild.github.io/api/#serve */
  serve(options?: ServeOptions): Promise<ServeResult>

  /** Cancel the in-flight build without tearing down the context. */
  cancel(): Promise<void>
  /** Release all resources held by the context. */
  dispose(): Promise<void>
}
