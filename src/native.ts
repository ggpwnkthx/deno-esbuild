/**
 * Native esbuild API for Deno
 *
 * This module provides direct access to the esbuild JavaScript API.
 * Note: The esbuild JS API does NOT expose an `onRebuild` callback.
 * For live reload notifications, use `Deno.watchFs` + `ctx.rebuild()` instead.
 *
 * @example
 * ```typescript
 * import { context } from "jsr:@ggpwnkthx/esbuild/native";
 *
 * const ctx = await context({
 *   entryPoints: ["src/index.ts"],
 *   bundle: true,
 * });
 *
 * // Watch files manually and trigger rebuilds
 * for await (const event of Deno.watchFs("src")) {
 *   console.log("File changed:", event.paths);
 *   await ctx.rebuild();
 * }
 * ```
 *
 * @module
 */

export {
  analyzeMetafile,
  analyzeMetafileSync,
  build,
  buildSync,
  context,
  formatMessages,
  formatMessagesSync,
  transform,
  transformSync,
  version,
} from "esbuild";

export type {
  BuildContext,
  BuildFailure,
  BuildOptions,
  BuildResult,
  FormatMessagesOptions,
  Message,
  Metafile,
  PartialMessage,
  Plugin,
  ServeOptions,
  ServeResult,
  TransformOptions,
  TransformResult,
  WatchOptions,
} from "esbuild";
