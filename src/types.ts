export type Platform = "browser" | "node" | "neutral";
export type Format = "iife" | "cjs" | "esm";
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
export type LogLevel = "verbose" | "debug" | "info" | "warning" | "error" | "silent";
export type Charset = "ascii" | "utf8";
export type Drop = "console" | "debugger";
export type AbsPaths = "code" | "log" | "metafile";

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

export interface StdinOptions {
  contents: string | Uint8Array;
  resolveDir?: string;
  sourcefile?: string;
  loader?: Loader;
}

export interface Message {
  id: string;
  pluginName: string;
  text: string;
  location: Location | null;
  notes: Note[];
  detail: unknown;
}

export interface Note {
  text: string;
  location: Location | null;
}

export interface Location {
  file: string;
  namespace: string;
  line: number;
  column: number;
  length: number;
  lineText: string;
  suggestion: string;
}

export interface OutputFile {
  path: string;
  contents: Uint8Array;
  hash: string;
  readonly text: string;
}

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

export interface BuildFailure extends Error {
  errors: Message[];
  warnings: Message[];
}

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

export interface CORSOptions {
  origin?: string | string[];
  [key: string]: unknown;
}

export interface ServeOnRequestArgs {
  remoteAddress: string;
  method: string;
  path: string;
  status: number;
  timeInMS: number;
}

export interface ServeResult {
  port: number;
  hosts: string[];
}

export interface TransformOptions extends CommonOptions {
  sourcefile?: string;
  loader?: Loader;
  banner?: string;
  footer?: string;
}

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

export interface TransformFailure extends Error {
  errors: Message[];
  warnings: Message[];
}

export interface Plugin {
  name: string;
  setup: (build: PluginBuild) => void | Promise<void>;
}

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

export interface OnStartResult {
  errors?: PartialMessage[];
  warnings?: PartialMessage[];
}

export interface OnEndResult {
  errors?: PartialMessage[];
  warnings?: PartialMessage[];
}

export interface OnResolveOptions {
  filter: RegExp;
  namespace?: string;
  [key: string]: unknown;
}

export interface OnResolveArgs {
  path: string;
  importer: string;
  namespace: string;
  resolveDir: string;
  kind: ImportKind;
  pluginData: unknown;
  with: Record<string, string>;
}

export type ImportKind =
  | "entry-point"
  | "import-statement"
  | "require-call"
  | "dynamic-import"
  | "require-resolve"
  | "import-rule"
  | "composes-from"
  | "url-token";

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

export interface OnLoadOptions {
  filter: RegExp;
  namespace?: string;
  [key: string]: unknown;
}

export interface OnLoadArgs {
  path: string;
  namespace: string;
  suffix: string;
  pluginData: unknown;
  with: Record<string, string>;
}

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

export interface PartialMessage {
  id?: string;
  pluginName?: string;
  text?: string;
  location?: Partial<Location> | null;
  notes?: PartialNote[];
  detail?: unknown;
}

export interface PartialNote {
  text?: string;
  location?: Partial<Location> | null;
}

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

export interface FormatMessagesOptions {
  kind: "error" | "warning";
  color?: boolean;
  terminalWidth?: number;
  [key: string]: unknown;
}

export interface AnalyzeMetafileOptions {
  color?: boolean;
  verbose?: boolean;
  [key: string]: unknown;
}

export interface WatchOptions {
  delay?: number;
  [key: string]: unknown;
}

export interface BuildContext<
  ProvidedOptions extends BuildOptions = BuildOptions,
> {
  rebuild(): Promise<BuildResult<ProvidedOptions>>;
  watch(options?: WatchOptions): Promise<void>;
  serve(options?: ServeOptions): Promise<ServeResult>;
  cancel(): Promise<void>;
  dispose(): Promise<void>;
}

export interface InitializeOptions {
  wasmURL?: string | URL;
  wasmModule?: WebAssembly.Module;
  worker?: boolean;
  [key: string]: unknown;
}
