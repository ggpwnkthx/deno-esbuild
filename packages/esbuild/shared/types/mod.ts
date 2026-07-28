/**
 * @module
 * Public TypeScript type declarations exported by the esbuild package.
 *
 * The implementations are split across the sibling modules in this directory:
 * - {@link ./primitives.ts} — string-literal unions (`Platform`, `Format`,
 *   `Loader`, `LogLevel`, `Charset`, `Drop`, `AbsPaths`).
 * - {@link ./common.ts} — `CommonOptions` supertype.
 * - {@link ./tsconfig.ts} — `TsconfigRaw`.
 * - {@link ./build.ts} — `BuildOptions`, `StdinOptions`, `OutputFile`,
 *   `BuildResult`, `BuildFailure`, `BuildContext`, `WatchOptions`.
 * - {@link ./transform.ts} — `TransformOptions`, `TransformResult`,
 *   `TransformFailure`.
 * - {@link ./serve.ts} — `ServeOptions`, `CORSOptions`,
 *   `ServeOnRequestArgs`, `ServeResult`.
 * - {@link ./diagnostics.ts} — `Message`, `Note`, `Location`,
 *   `PartialMessage`, `PartialNote`, `FormatMessagesOptions`.
 * - {@link ./plugin.ts} — `Plugin`, `PluginBuild`, resolve/lifecycle
 *   interfaces, `ImportKind`.
 * - {@link ./metafile.ts} — `Metafile`, `AnalyzeMetafileOptions`.
 * - {@link ./api.ts} — public function declarations, `InitializeOptions`,
 *   `version`, `stop`.
 *
 * This barrel keeps the historical `./types.ts` import path resolving to
 * the same public surface.
 */
export type { AbsPaths, Charset, Drop, Format, Loader, LogLevel, Platform } from './primitives.ts'
export type { TsconfigRaw } from './tsconfig.ts'
export type { CommonOptions } from './common.ts'
export type {
  BuildContext,
  BuildFailure,
  BuildOptions,
  BuildResult,
  OutputFile,
  StdinOptions,
  WatchOptions,
} from './build.ts'
export type { TransformFailure, TransformOptions, TransformResult } from './transform.ts'
export type { CORSOptions, ServeOnRequestArgs, ServeOptions, ServeResult } from './serve.ts'
export type {
  FormatMessagesOptions,
  Location,
  Message,
  Note,
  PartialMessage,
  PartialNote,
} from './diagnostics.ts'
export type { ImportKind, Plugin, PluginBuild } from './plugin.ts'
export type {
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
export type { AnalyzeMetafileOptions, Metafile } from './metafile.ts'
export type {
  analyzeMetafile,
  analyzeMetafileSync,
  build,
  buildSync,
  context,
  formatMessages,
  formatMessagesSync,
  initialize,
  SameShape,
  stop,
  transform,
  transformSync,
  version,
} from './api.ts'
export type { InitializeOptions } from './api.ts'
