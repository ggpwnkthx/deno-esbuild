/**
 * The target platform for the build.
 */
export type Platform = "browser" | "node" | "neutral";
/**
 * The output format for the bundle.
 */
export type Format = "iife" | "cjs" | "esm";
/**
 * The loader to use for file resolution.
 */
export type Loader =
  | "base64"
  | "binary"
  | "copy"
  | "css"
  | "dataurl"
  | "default"
  | "empty"
  | "file"
  | "js"
  | "json"
  | "jsx"
  | "local-css"
  | "text"
  | "ts"
  | "tsx";
/**
 * The level of logging for the build.
 */
export type LogLevel = "verbose" | "debug" | "info" | "warning" | "error" | "silent";
/**
 * The character encoding for output files.
 */
export type Charset = "ascii" | "utf8";
/**
 * The code to drop during minification.
 */
export type Drop = "console" | "debugger";
/**
 * The types of paths to return as absolute paths in the output.
 */
export type AbsPaths = "code" | "log" | "metafile";

/**
 * Common options shared between build and transform operations.
 */
export interface CommonOptions {
  sourcemap?: boolean | "linked" | "inline" | "external" | "both";
  legalComments?: "none" | "inline" | "eof" | "linked" | "external";
  sourceRoot?: string;
  sourcesContent?: boolean;
  format?: Format;
  globalName?: string;
  target?: string | string[];
  supported?: Record<string, boolean>;
  platform?: Platform;
  mangleProps?: RegExp;
  reserveProps?: RegExp;
  mangleQuoted?: boolean;
  mangleCache?: Record<string, string | false>;
  drop?: Drop[];
  dropLabels?: string[];
  minify?: boolean;
  minifyWhitespace?: boolean;
  minifyIdentifiers?: boolean;
  minifySyntax?: boolean;
  lineLimit?: number;
  charset?: Charset;
  treeShaking?: boolean;
  ignoreAnnotations?: boolean;
  jsx?: "transform" | "preserve" | "automatic";
  jsxFactory?: string;
  jsxFragment?: string;
  jsxImportSource?: string;
  jsxDev?: boolean;
  jsxSideEffects?: boolean;
  define?: Record<string, string>;
  pure?: string[];
  keepNames?: boolean;
  absPaths?: AbsPaths[];
  color?: boolean;
  logLevel?: LogLevel;
  logLimit?: number;
  logOverride?: Record<string, LogLevel>;
  tsconfigRaw?: string | TsconfigRaw;
}

/**
 * TypeScript compiler options passed directly to esbuild.
 * Used when tsconfigRaw is a string.
 */
export interface TsconfigRaw {
  compilerOptions?: {
    alwaysStrict?: boolean;
    baseUrl?: string;
    experimentalDecorators?: boolean;
    importsNotUsedAsValues?: "remove" | "preserve" | "error";
    jsx?: "preserve" | "react-native" | "react" | "react-jsx" | "react-jsxdev";
    jsxFactory?: string;
    jsxFragmentFactory?: string;
    jsxImportSource?: string;
    paths?: Record<string, string[]>;
    preserveValueImports?: boolean;
    strict?: boolean;
    target?: string;
    useDefineForClassFields?: boolean;
    verbatimModuleSyntax?: boolean;
  };
}

/**
 * Options for the build operation.
 */
export interface BuildOptions extends CommonOptions {
  bundle?: boolean;
  splitting?: boolean;
  preserveSymlinks?: boolean;
  outfile?: string;
  metafile?: boolean;
  outdir?: string;
  outbase?: string;
  external?: string[];
  packages?: "bundle" | "external";
  alias?: Record<string, string>;
  loader?: Record<string, Loader>;
  resolveExtensions?: string[];
  mainFields?: string[];
  conditions?: string[];
  write?: boolean;
  allowOverwrite?: boolean;
  tsconfig?: string;
  outExtension?: Record<string, string>;
  publicPath?: string;
  entryNames?: string;
  chunkNames?: string;
  assetNames?: string;
  inject?: string[];
  banner?: Record<string, string>;
  footer?: Record<string, string>;
  entryPoints?: (string | { in: string; out: string })[] | Record<string, string>;
  stdin?: StdinOptions;
  plugins?: Plugin[];
  absWorkingDir?: string;
  nodePaths?: string[];
}

/**
 * Options for reading from standard input.
 */
export interface StdinOptions {
  contents: string | Uint8Array;
  resolveDir?: string;
  sourcefile?: string;
  loader?: Loader;
}

/**
 * A structured error or warning message from esbuild.
 */
export interface Message {
  id: string;
  pluginName: string;
  text: string;
  location: Location | null;
  notes: Note[];
  detail: unknown;
}

/**
 * A note attached to a message providing additional context.
 */
export interface Note {
  text: string;
  location: Location | null;
}

/**
 * The location in source code where a message originates.
 */
export interface Location {
  file: string;
  namespace: string;
  line: number;
  column: number;
  length: number;
  lineText: string;
  suggestion: string;
}

/**
 * A file written to the file system or returned in the build result.
 */
export interface OutputFile {
  path: string;
  contents: Uint8Array;
  hash: string;
  readonly text: string;
}

/**
 * The result of a successful build operation.
 */
export type BuildResult<
  ProvidedOptions extends BuildOptions = BuildOptions,
> =
  & (ProvidedOptions["write"] extends false ? { outputFiles: OutputFile[] }
    : { outputFiles?: undefined })
  & (ProvidedOptions["metafile"] extends true ? { metafile: Metafile }
    : { metafile?: undefined })
  & (ProvidedOptions["mangleCache"] extends object
    ? { mangleCache: Record<string, string | false> }
    : { mangleCache?: undefined })
  & {
    errors: Message[];
    warnings: Message[];
  };

/**
 * Error thrown when a build operation fails.
 */
export interface BuildFailure extends Error {
  errors: Message[];
  warnings: Message[];
}

/**
 * Options for the development server.
 */
export interface ServeOptions {
  port?: number;
  host?: string;
  servedir?: string;
  keyfile?: string;
  certfile?: string;
  fallback?: string;
  cors?: CORSOptions;
  onRequest?: (args: ServeOnRequestArgs) => void;
  [key: string]: unknown;
}

/**
 * Cross-Origin Resource Sharing options for the development server.
 */
export interface CORSOptions {
  origin?: string | string[];
  [key: string]: unknown;
}

/**
 * Arguments passed to the onRequest callback of the development server.
 */
export interface ServeOnRequestArgs {
  remoteAddress: string;
  method: string;
  path: string;
  status: number;
  timeInMS: number;
}

/**
 * Result from starting the development server.
 */
export interface ServeResult {
  port: number;
  hosts: string[];
}

/**
 * Options for the transform operation.
 */
export interface TransformOptions extends CommonOptions {
  sourcefile?: string;
  loader?: Loader;
  banner?: string;
  footer?: string;
}

/**
 * The result of a successful transform operation.
 */
export type TransformResult<
  ProvidedOptions extends TransformOptions = TransformOptions,
> =
  & (ProvidedOptions["mangleCache"] extends object
    ? { mangleCache: Record<string, string | false> }
    : { mangleCache?: undefined })
  & (ProvidedOptions["legalComments"] extends "external" ? { legalComments: string }
    : { legalComments?: undefined })
  & {
    code: string;
    map: string;
    warnings: Message[];
  };

/**
 * Error thrown when a transform operation fails.
 */
export interface TransformFailure extends Error {
  errors: Message[];
  warnings: Message[];
}

/**
 * A user-defined plugin that hooks into the build process.
 */
export interface Plugin {
  name: string;
  setup: (build: PluginBuild) => void | Promise<void>;
}

/**
 * The build object passed to a plugin's setup function.
 * Provides methods for registering callbacks and resolving/loading modules.
 */
export interface PluginBuild {
  initialOptions: BuildOptions;
  resolve(
    path: string,
    options?: ResolveOptions,
  ): Promise<ResolveResult>;
  onStart(
    callback: () => OnStartResult | null | void | Promise<OnStartResult | null | void>,
  ): void;
  onEnd(
    callback: (
      result: BuildResult,
    ) => OnEndResult | null | void | Promise<OnEndResult | null | void>,
  ): void;
  onResolve(
    options: OnResolveOptions,
    callback: (
      args: OnResolveArgs,
    ) =>
      | OnResolveResult
      | null
      | undefined
      | Promise<OnResolveResult | null | undefined>,
  ): void;
  onLoad(
    options: OnLoadOptions,
    callback: (
      args: OnLoadArgs,
    ) => OnLoadResult | null | undefined | Promise<OnLoadResult | null | undefined>,
  ): void;
  onDispose(callback: () => void): void;
  esbuild: {
    context: (options: BuildOptions) => Promise<BuildContext>;
    build: (options: BuildOptions) => Promise<BuildResult>;
    buildSync: () => BuildResult;
    transform: (
      input: string | Uint8Array,
      options?: TransformOptions,
    ) => Promise<TransformResult>;
    transformSync: () => TransformResult;
    formatMessages: (
      messages: PartialMessage[],
      options: FormatMessagesOptions,
    ) => Promise<string[]>;
    formatMessagesSync: () => string[];
    analyzeMetafile: (
      metafile: string,
      options?: AnalyzeMetafileOptions,
    ) => Promise<string>;
    analyzeMetafileSync: () => string;
    initialize: (options: InitializeOptions) => Promise<void>;
    version: string;
  };
}

/**
 * Options for the resolve callback registered by a plugin.
 */
export interface ResolveOptions {
  pluginName?: string;
  importer?: string;
  namespace?: string;
  resolveDir?: string;
  kind?: ImportKind;
  pluginData?: unknown;
  with?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Result returned by the resolve callback of a plugin.
 */
export interface ResolveResult {
  errors: Message[];
  warnings: Message[];
  path: string;
  external: boolean;
  sideEffects: boolean;
  namespace: string;
  suffix: string;
  pluginData: unknown;
}

/**
 * Result returned by the onStart callback of a plugin.
 */
export interface OnStartResult {
  errors?: PartialMessage[];
  warnings?: PartialMessage[];
}

/**
 * Result returned by the onEnd callback of a plugin.
 */
export interface OnEndResult {
  errors?: PartialMessage[];
  warnings?: PartialMessage[];
}

/**
 * Options for registering an onResolve callback on a plugin build.
 */
export interface OnResolveOptions {
  filter: RegExp;
  namespace?: string;
  [key: string]: unknown;
}

/**
 * Arguments passed to the onResolve callback of a plugin.
 */
export interface OnResolveArgs {
  path: string;
  importer: string;
  namespace: string;
  resolveDir: string;
  kind: ImportKind;
  pluginData: unknown;
  with: Record<string, string>;
}

/**
 * The kind of import that triggered a resolve operation.
 */
export type ImportKind =
  | "entry-point"
  | "import-statement"
  | "require-call"
  | "dynamic-import"
  | "require-resolve"
  | "import-rule"
  | "composes-from"
  | "url-token";

/**
 * Result returned by the onResolve callback of a plugin.
 */
export interface OnResolveResult {
  pluginName?: string;
  errors?: PartialMessage[];
  warnings?: PartialMessage[];
  path?: string;
  external?: boolean;
  sideEffects?: boolean;
  namespace?: string;
  suffix?: string;
  pluginData?: unknown;
  watchFiles?: string[];
  watchDirs?: string[];
  [key: string]: unknown;
}

/**
 * Options for registering an onLoad callback on a plugin build.
 */
export interface OnLoadOptions {
  filter: RegExp;
  namespace?: string;
  [key: string]: unknown;
}

/**
 * Arguments passed to the onLoad callback of a plugin.
 */
export interface OnLoadArgs {
  path: string;
  namespace: string;
  suffix: string;
  pluginData: unknown;
  with: Record<string, string>;
}

/**
 * Result returned by the onLoad callback of a plugin.
 */
export interface OnLoadResult {
  pluginName?: string;
  errors?: PartialMessage[];
  warnings?: PartialMessage[];
  contents?: string | Uint8Array;
  resolveDir?: string;
  loader?: Loader;
  pluginData?: unknown;
  watchFiles?: string[];
  watchDirs?: string[];
  [key: string]: unknown;
}

/**
 * A message with all fields optional, used in plugin callbacks.
 */
export interface PartialMessage {
  id?: string;
  pluginName?: string;
  text?: string;
  location?: Partial<Location> | null;
  notes?: PartialNote[];
  detail?: unknown;
}

/**
 * A note with all fields optional, used in plugin callbacks.
 */
export interface PartialNote {
  text?: string;
  location?: Partial<Location> | null;
}

/**
 * Metadata about the build inputs and outputs.
 */
export interface Metafile {
  inputs: Record<
    string,
    {
      bytes: number;
      imports: {
        path: string;
        kind: ImportKind;
        external?: boolean;
        original?: string;
        with?: Record<string, string>;
      }[];
      format?: "cjs" | "esm";
      with?: Record<string, string>;
    }
  >;
  outputs: Record<
    string,
    {
      bytes: number;
      inputs: Record<string, { bytesInOutput: number }>;
      imports: {
        path: string;
        kind: ImportKind | "file-loader";
        external?: boolean;
      }[];
      exports: string[];
      entryPoint?: string;
      cssBundle?: string;
    }
  >;
}

/**
 * Options for formatting error or warning messages.
 */
export interface FormatMessagesOptions {
  kind: "error" | "warning";
  color?: boolean;
  terminalWidth?: number;
  [key: string]: unknown;
}

/**
 * Options for analyzing a metafile.
 */
export interface AnalyzeMetafileOptions {
  color?: boolean;
  verbose?: boolean;
  [key: string]: unknown;
}

/**
 * Options for the watch operation.
 */
export interface WatchOptions {
  delay?: number;
  [key: string]: unknown;
}

/**
 * A context for a build operation that supports watch and serve modes.
 */
export interface BuildContext<
  ProvidedOptions extends BuildOptions = BuildOptions,
> {
  rebuild(): Promise<BuildResult<ProvidedOptions>>;
  watch(options?: WatchOptions): Promise<void>;
  serve(options?: ServeOptions): Promise<ServeResult>;
  cancel(): Promise<void>;
  dispose(): Promise<void>;
}

/**
 * Options for initializing the esbuild service.
 */
export interface InitializeOptions {
  wasmURL?: string | URL;
  wasmModule?: WebAssembly.Module;
  worker?: boolean;
  [key: string]: unknown;
}
