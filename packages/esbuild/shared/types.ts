/**
 * @module
 * This module contains all TypeScript type definitions exported by the esbuild
 * package.
 *
 * It includes:
 * - `BuildOptions` and `TransformOptions` – configuration for building and transforming.
 * - `Plugin` and `PluginBuild` – the plugin API surface.
 * - `BuildResult`, `BuildContext`, `BuildFailure` – build outcome types.
 * - `ServeOptions`, `ServeResult`, `ServeOnRequestArgs` – dev server types.
 * - `Message`, `Note`, `Location`, `PartialMessage`, `PartialNote` – diagnostic types.
 * - All JSII-compatible function signatures (`build`, `context`, `transform`,
 *   `buildSync`, `transformSync`, `formatMessages`, `formatMessagesSync`,
 *   `analyzeMetafile`, `analyzeMetafileSync`, `initialize`, `stop`).
 */
/**
 * The platform to bundle for.
 *
 * @see https://esbuild.github.io/api/#platform
 */
export type Platform = 'browser' | 'node' | 'neutral'
/**
 * The output format of the bundle.
 *
 * @see https://esbuild.github.io/api/#format
 */
export type Format = 'iife' | 'cjs' | 'esm'
/**
 * Built-in loaders that map a file extension to how esbuild interprets the file.
 *
 * @see https://esbuild.github.io/api/#loader
 */
export type Loader =
  | 'base64'
  | 'binary'
  | 'copy'
  | 'css'
  | 'dataurl'
  | 'default'
  | 'empty'
  | 'file'
  | 'js'
  | 'json'
  | 'jsx'
  | 'local-css'
  | 'text'
  | 'ts'
  | 'tsx'
/**
 * The log level that esbuild uses when printing log messages.
 *
 * @see https://esbuild.github.io/api/#log-level
 */
export type LogLevel =
  | 'verbose'
  | 'debug'
  | 'info'
  | 'warning'
  | 'error'
  | 'silent'
/**
 * The character set to use when loading text-based files.
 *
 * @see https://esbuild.github.io/api/#charset
 */
export type Charset = 'ascii' | 'utf8'
/**
 * Debugger-like features whose calls should be removed from output.
 *
 * @see https://esbuild.github.io/api/#drop
 */
export type Drop = 'console' | 'debugger'
/**
 * Output paths whose values should be made absolute.
 *
 * @see https://esbuild.github.io/api/#abs-paths
 */
export type AbsPaths = 'code' | 'log' | 'metafile'

/**
 * Options shared between {@link BuildOptions} and {@link TransformOptions}.
 * Kept internal because it's a structural supertype, not a public input.
 */
interface CommonOptions {
  /** Documentation: https://esbuild.github.io/api/#sourcemap */
  sourcemap?: boolean | 'linked' | 'inline' | 'external' | 'both'
  /** Documentation: https://esbuild.github.io/api/#legal-comments */
  legalComments?: 'none' | 'inline' | 'eof' | 'linked' | 'external'
  /** Documentation: https://esbuild.github.io/api/#source-root */
  sourceRoot?: string
  /** Documentation: https://esbuild.github.io/api/#sources-content */
  sourcesContent?: boolean

  /** Documentation: https://esbuild.github.io/api/#format */
  format?: Format
  /** Documentation: https://esbuild.github.io/api/#global-name */
  globalName?: string
  /** Documentation: https://esbuild.github.io/api/#target */
  target?: string | string[]
  /** Documentation: https://esbuild.github.io/api/#supported */
  supported?: Record<string, boolean>
  /** Documentation: https://esbuild.github.io/api/#platform */
  platform?: Platform

  /** Documentation: https://esbuild.github.io/api/#mangle-props */
  mangleProps?: RegExp
  /** Documentation: https://esbuild.github.io/api/#mangle-props */
  reserveProps?: RegExp
  /** Documentation: https://esbuild.github.io/api/#mangle-props */
  mangleQuoted?: boolean
  /** Documentation: https://esbuild.github.io/api/#mangle-props */
  mangleCache?: Record<string, string | false>
  /** Documentation: https://esbuild.github.io/api/#drop */
  drop?: Drop[]
  /** Documentation: https://esbuild.github.io/api/#drop-labels */
  dropLabels?: string[]
  /** Documentation: https://esbuild.github.io/api/#minify */
  minify?: boolean
  /** Documentation: https://esbuild.github.io/api/#minify */
  minifyWhitespace?: boolean
  /** Documentation: https://esbuild.github.io/api/#minify */
  minifyIdentifiers?: boolean
  /** Documentation: https://esbuild.github.io/api/#minify */
  minifySyntax?: boolean
  /** Documentation: https://esbuild.github.io/api/#line-limit */
  lineLimit?: number
  /** Documentation: https://esbuild.github.io/api/#charset */
  charset?: Charset
  /** Documentation: https://esbuild.github.io/api/#tree-shaking */
  treeShaking?: boolean
  /** Documentation: https://esbuild.github.io/api/#ignore-annotations */
  ignoreAnnotations?: boolean

  /** Documentation: https://esbuild.github.io/api/#jsx */
  jsx?: 'transform' | 'preserve' | 'automatic'
  /** Documentation: https://esbuild.github.io/api/#jsx-factory */
  jsxFactory?: string
  /** Documentation: https://esbuild.github.io/api/#jsx-fragment */
  jsxFragment?: string
  /** Documentation: https://esbuild.github.io/api/#jsx-import-source */
  jsxImportSource?: string
  /** Documentation: https://esbuild.github.io/api/#jsx-development */
  jsxDev?: boolean
  /** Documentation: https://esbuild.github.io/api/#jsx-side-effects */
  jsxSideEffects?: boolean

  /** Documentation: https://esbuild.github.io/api/#define */
  define?: { [key: string]: string }
  /** Documentation: https://esbuild.github.io/api/#pure */
  pure?: string[]
  /** Documentation: https://esbuild.github.io/api/#keep-names */
  keepNames?: boolean

  /** Documentation: https://esbuild.github.io/api/#abs-paths */
  absPaths?: AbsPaths[]
  /** Documentation: https://esbuild.github.io/api/#color */
  color?: boolean
  /** Documentation: https://esbuild.github.io/api/#log-level */
  logLevel?: LogLevel
  /** Documentation: https://esbuild.github.io/api/#log-limit */
  logLimit?: number
  /** Documentation: https://esbuild.github.io/api/#log-override */
  logOverride?: Record<string, LogLevel>

  /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
  tsconfigRaw?: string | TsconfigRaw
}

/**
 * Subset of `tsconfig.json` fields supported by esbuild's TypeScript handling.
 *
 * @see https://esbuild.github.io/api/#tsconfig-raw
 */
export interface TsconfigRaw {
  /**
   * Subset of the `compilerOptions` section of `tsconfig.json` recognized by
   * esbuild's TypeScript handling.
   */
  compilerOptions?: {
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    alwaysStrict?: boolean
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    baseUrl?: string
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    experimentalDecorators?: boolean
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    importsNotUsedAsValues?: 'remove' | 'preserve' | 'error'
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    jsx?: 'preserve' | 'react-native' | 'react' | 'react-jsx' | 'react-jsxdev'
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    jsxFactory?: string
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    jsxFragmentFactory?: string
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    jsxImportSource?: string
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    paths?: Record<string, string[]>
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    preserveValueImports?: boolean
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    strict?: boolean
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    target?: string
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    useDefineForClassFields?: boolean
    /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
    verbatimModuleSyntax?: boolean
  }
}

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
 * A single esbuild log message (error or warning).
 *
 * @see https://esbuild.github.io/api/#errors
 */
export interface Message {
  /** Stable identifier for the error category (e.g. `"TS2322"`). */
  id: string
  /** Name of the plugin that produced the message, or empty for the service. */
  pluginName: string
  /** Human-readable description of the diagnostic. */
  text: string
  /** Source location the diagnostic refers to, or null if unknown. */
  location: Location | null
  /** Additional notes attached to the message. */
  notes: Note[]

  /**
   * Optional user-specified data that is passed through unmodified. You can
   * use this to stash the original error, for example.
   */
  // deno-lint-ignore no-explicit-any
  detail: any
}

/**
 * A secondary note attached to a {@link Message}.
 *
 * @see https://esbuild.github.io/api/#errors
 */
export interface Note {
  /** Human-readable description of the note. */
  text: string
  /** Source location the note refers to, or null if unknown. */
  location: Location | null
}

/**
 * The source location associated with a {@link Message} or {@link Note}.
 *
 * @see https://esbuild.github.io/api/#errors
 */
export interface Location {
  /** Absolute path of the file the diagnostic refers to. */
  file: string
  /** Loader namespace (e.g. `"file"`, `"http"`) associated with the path. */
  namespace: string
  /** 1-based line number. */
  line: number
  /** 0-based column offset, in bytes. */
  column: number
  /** Length of the highlighted region, in bytes. */
  length: number
  /** Text of the source line that contains the diagnostic. */
  lineText: string
  /** Replacement text suggested by esbuild, or empty if none. */
  suggestion: string
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

/** Documentation: https://esbuild.github.io/api/#serve-arguments */
export interface ServeOptions {
  /** TCP port the dev server should listen on. */
  port?: number
  /** Hostname or IP address to bind to. */
  host?: string
  /** Directory of static files to serve alongside the bundled output. */
  servedir?: string
  /** Path to the TLS private key file. */
  keyfile?: string
  /** Path to the TLS certificate file. */
  certfile?: string
  /** Fallback HTML file served when the requested path is not found. */
  fallback?: string
  /** CORS configuration for the dev server. */
  cors?: CORSOptions
  /** Callback fired for every incoming HTTP request. */
  onRequest?: (args: ServeOnRequestArgs) => void
}

/** Documentation: https://esbuild.github.io/api/#cors */
export interface CORSOptions {
  /** Allowed `Origin` header value(s); strings or a list of strings. */
  origin?: string | string[]
}

/**
 * Information about an individual request served by the dev server.
 *
 * @see https://esbuild.github.io/api/#serve-arguments
 */
export interface ServeOnRequestArgs {
  /** Client IP address reported for the request. */
  remoteAddress: string
  /** HTTP method (e.g. `"GET"`, `"POST"`). */
  method: string
  /** Request path, including the leading slash. */
  path: string
  /** HTTP status code the server responded with. */
  status: number
  /** The time to generate the response, not to send it */
  timeInMS: number
}

/** Documentation: https://esbuild.github.io/api/#serve-return-values */
export interface ServeResult {
  /** TCP port the dev server is bound to. */
  port: number
  /** Hostname(s) the dev server can be reached on. */
  hosts: string[]
}

/**
 * Options for configuring a single esbuild transform.
 *
 * @see https://esbuild.github.io/api/#transform-api
 */
export interface TransformOptions extends CommonOptions {
  /** Documentation: https://esbuild.github.io/api/#sourcefile */
  sourcefile?: string
  /** Documentation: https://esbuild.github.io/api/#loader */
  loader?: Loader
  /** Documentation: https://esbuild.github.io/api/#banner */
  banner?: string
  /** Documentation: https://esbuild.github.io/api/#footer */
  footer?: string
}

/**
 * The result of a successful esbuild transform.
 *
 * @see https://esbuild.github.io/api/#transform-api
 */
export interface TransformResult<
  ProvidedOptions extends TransformOptions = TransformOptions,
> {
  /** Transformed source code. */
  code: string
  /** Source map string, or empty when not requested. */
  map: string
  /** Warnings collected during the transform. */
  warnings: Message[]
  /** Only when "mangleCache" is present */
  mangleCache:
    | Record<string, string | false>
    | (ProvidedOptions['mangleCache'] extends object ? never : undefined)
  /** Only when "legalComments" is "external" */
  legalComments:
    | string
    | (ProvidedOptions['legalComments'] extends 'external' ? never : undefined)
}

/**
 * The error value rejected from a failed esbuild transform.
 *
 * @see https://esbuild.github.io/api/#transform-api
 */
export interface TransformFailure extends Error {
  /** Errors that caused the transform to fail. */
  errors: Message[]
  /** Warnings collected before the transform failed. */
  warnings: Message[]
}

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

/**
 * A partial version of {@link Message} where every field is optional. Returned
 * by plugin callbacks that may not have full information about an issue.
 *
 * @see https://esbuild.github.io/plugins/#on-start
 */
export interface PartialMessage {
  /** Stable identifier for the error category (e.g. `"TS2322"`). */
  id?: string
  /** Name of the plugin that produced the message, or empty for the service. */
  pluginName?: string
  /** Human-readable description of the diagnostic. */
  text?: string
  /** Source location the diagnostic refers to, or null if unknown. */
  location?: Partial<Location> | null
  /** Additional notes attached to the message. */
  notes?: PartialNote[]
  /** Optional user-specified data passed through unmodified. */
  // deno-lint-ignore no-explicit-any
  detail?: any
}

/**
 * A partial version of {@link Note} where every field is optional.
 *
 * @see https://esbuild.github.io/plugins/#on-start
 */
export interface PartialNote {
  /** Human-readable description of the note. */
  text?: string
  /** Source location the note refers to, or null if unknown. */
  location?: Partial<Location> | null
}

/** Documentation: https://esbuild.github.io/api/#metafile */
export interface Metafile {
  /** Inputs read by the build, keyed by path. */
  inputs: {
    [path: string]: {
      /** Size of the input on disk, in bytes. */
      bytes: number
      imports: {
        /** Path the input imports. */
        path: string
        /** Kind of import that triggered the load. */
        kind: ImportKind
        /** Whether the imported path is external. */
        external?: boolean
        /** Original text the bundler rewrote into `path`. */
        original?: string
        /** Import attributes (e.g. `{ type: "json" }`). */
        with?: Record<string, string>
      }[]
      /** Module format detected for the input. */
      format?: 'cjs' | 'esm'
      /** Import attributes for the input module. */
      with?: Record<string, string>
    }
  }
  /** Outputs produced by the build, keyed by path. */
  outputs: {
    [path: string]: {
      /** Size of the output on disk, in bytes. */
      bytes: number
      inputs: {
        [path: string]: {
          /** Bytes contributed by the input to the output. */
          bytesInOutput: number
        }
      }
      imports: {
        /** Path the output imports. */
        path: string
        /** Kind of import that triggered the load. */
        kind: ImportKind | 'file-loader'
        /** Whether the imported path is external. */
        external?: boolean
      }[]
      /** Names exported by the output. */
      exports: string[]
      /** Entry point that produced this output, if any. */
      entryPoint?: string
      /** Path to the bundled CSS sibling, if any. */
      cssBundle?: string
    }
  }
}

/**
 * Options for formatting diagnostic messages with {@link formatMessages}.
 *
 * @see https://esbuild.github.io/api/#format-messages
 */
export interface FormatMessagesOptions {
  /** Whether the messages are errors or warnings. */
  kind: 'error' | 'warning'
  /** Whether to emit ANSI color escapes. */
  color?: boolean
  /** Width of the terminal used for line wrapping. */
  terminalWidth?: number
}

/**
 * Options for analyzing a metafile with {@link analyzeMetafile}.
 *
 * @see https://esbuild.github.io/api/#analyze
 */
export interface AnalyzeMetafileOptions {
  /** Whether to emit ANSI color escapes. */
  color?: boolean
  /** Whether to include every input in the analysis output. */
  verbose?: boolean
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
 * A long-running esbuild build context, returned from {@link context}.
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

/**
 * Type-level helper that rejects properties with typos in object literals.
 * Excess keys (present on `In` but not on `Out`) are typed as `never`, so
 * TypeScript catches them at the call site.
 *
 * @see https://stackoverflow.com/questions/49580725
 */
type SameShape<Out, In extends Out> =
  & In
  & { [Key in Exclude<keyof In, keyof Out>]: never }

/**
 * This function invokes the "esbuild" command-line tool for you. It returns a
 * promise that either resolves with a "BuildResult" object or rejects with a
 * "BuildFailure" object.
 *
 * - Works in node: yes
 * - Works in browser: yes
 *
 * Documentation: https://esbuild.github.io/api/#build
 */
export declare function build<T extends BuildOptions>(
  options: SameShape<BuildOptions, T>,
): Promise<BuildResult<T>>

/**
 * This is the advanced long-running form of "build" that supports additional
 * features such as watch mode and a local development server.
 *
 * - Works in node: yes
 * - Works in browser: no
 *
 * Documentation: https://esbuild.github.io/api/#build
 */
export declare function context<T extends BuildOptions>(
  options: SameShape<BuildOptions, T>,
): Promise<BuildContext<T>>

/**
 * This function transforms a single JavaScript file. It can be used to minify
 * JavaScript, convert TypeScript/JSX to JavaScript, or convert newer JavaScript
 * to older JavaScript. It returns a promise that is either resolved with a
 * "TransformResult" object or rejected with a "TransformFailure" object.
 *
 * - Works in node: yes
 * - Works in browser: yes
 *
 * Documentation: https://esbuild.github.io/api/#transform
 */
export declare function transform<T extends TransformOptions>(
  input: string | Uint8Array,
  options?: SameShape<TransformOptions, T>,
): Promise<TransformResult<T>>

/**
 * Converts log messages to formatted message strings suitable for printing in
 * the terminal. This allows you to reuse the built-in behavior of esbuild's
 * log message formatter. This is a batch-oriented API for efficiency.
 *
 * - Works in node: yes
 * - Works in browser: yes
 */
export declare function formatMessages(
  messages: PartialMessage[],
  options: FormatMessagesOptions,
): Promise<string[]>

/**
 * Pretty-prints an analysis of the metafile JSON to a string. This is just for
 * convenience to be able to match esbuild's pretty-printing exactly. If you want
 * to customize it, you can just inspect the data in the metafile yourself.
 *
 * - Works in node: yes
 * - Works in browser: yes
 *
 * Documentation: https://esbuild.github.io/api/#analyze
 */
export declare function analyzeMetafile(
  metafile: Metafile | string,
  options?: AnalyzeMetafileOptions,
): Promise<string>

/**
 * A synchronous version of "build".
 *
 * - Works in node: yes
 * - Works in browser: no
 *
 * Documentation: https://esbuild.github.io/api/#build
 */
export declare function buildSync<T extends BuildOptions>(
  options: SameShape<BuildOptions, T>,
): BuildResult<T>

/**
 * A synchronous version of "transform".
 *
 * - Works in node: yes
 * - Works in browser: no
 *
 * Documentation: https://esbuild.github.io/api/#transform
 */
export declare function transformSync<T extends TransformOptions>(
  input: string | Uint8Array,
  options?: SameShape<TransformOptions, T>,
): TransformResult<T>

/**
 * A synchronous version of "formatMessages".
 *
 * - Works in node: yes
 * - Works in browser: no
 */
export declare function formatMessagesSync(
  messages: PartialMessage[],
  options: FormatMessagesOptions,
): string[]

/**
 * A synchronous version of "analyzeMetafile".
 *
 * - Works in node: yes
 * - Works in browser: no
 *
 * Documentation: https://esbuild.github.io/api/#analyze
 */
export declare function analyzeMetafileSync(
  metafile: Metafile | string,
  options?: AnalyzeMetafileOptions,
): string

/**
 * This configures the browser-based version of esbuild. It is necessary to
 * call this first and wait for the returned promise to be resolved before
 * making other API calls when using esbuild in the browser.
 *
 * - Works in node: yes
 * - Works in browser: yes ("options" is required)
 *
 * Documentation: https://esbuild.github.io/api/#browser
 */
export declare function initialize(options: InitializeOptions): Promise<void>

/**
 * Options accepted by {@link initialize}.
 *
 * @see https://esbuild.github.io/api/#browser
 */
export interface InitializeOptions {
  /**
   * The URL of the "esbuild.wasm" file. This must be provided when running
   * esbuild in the browser.
   */
  wasmURL?: string | URL

  /**
   * The result of calling "new WebAssembly.Module(buffer)" where "buffer"
   * is a typed array or ArrayBuffer containing the binary code of the
   * "esbuild.wasm" file.
   *
   * You can use this as an alternative to "wasmURL" for environments where it's
   * not possible to download the WebAssembly module.
   */
  wasmModule?: WebAssembly.Module

  /**
   * By default esbuild runs the WebAssembly-based browser API in a web worker
   * to avoid blocking the UI thread. This can be disabled by setting "worker"
   * to false.
   */
  worker?: boolean
}

/** The version string of the embedded esbuild binary. */
export let version: string

/**
 * Call this function to terminate esbuild's child process. The child process
 * is not terminated and re-created after each API call because it's more
 * efficient to keep it around when there are multiple API calls.
 *
 * In node this happens automatically before the parent node process exits. So
 * you only need to call this if you know you will not make any more esbuild
 * API calls and you want to clean up resources.
 *
 * Unlike node, Deno lacks the necessary APIs to clean up child processes
 * automatically. You must manually call stop() in Deno when you're done
 * using esbuild or Deno will continue running forever.
 *
 * Another reason you might want to call this is if you are using esbuild from
 * within a Deno test. Deno fails tests that create a child process without
 * killing it before the test ends, so you have to call this function (and
 * await the returned promise) in every Deno test that uses esbuild.
 */
export declare function stop(): Promise<void>
