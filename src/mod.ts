/**
 * esbuild Deno API
 *
 * This package provides the esbuild API for Deno. esbuild is a fast,
 * compact, and feature-rich bundler and minifier.
 *
 * @example
 * ```typescript
 * import { build, context } from "jsr:@ggpwnkthx/esbuild";
 *
 * // Build files
 * await build({
 *   entryPoints: ["src/index.ts"],
 *   bundle: true,
 *   outfile: "dist/bundle.js",
 * });
 *
 * // Or use context for watch mode and serve
 * const ctx = await context({
 *   entryPoints: ["src/index.ts"],
 *   bundle: true,
 * });
 * await ctx.watch();
 * await ctx.serve({ port: 8000 });
 * ```
 *
 * @module
 */

export * from "./types.ts";
export * from "./api.ts";
export * from "./plugins/mod.ts";
