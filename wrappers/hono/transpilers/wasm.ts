/**
 * Provides a Hono middleware that uses esbuild's WASM API to transpile
 * TypeScript/TSX responses.
 */
import * as esbuild from "esbuild";
import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import esbuildTranspiler from "../mod.ts";
import type { Options } from "@ggpwnkthx/esbuild-wrapper-shared";

let initialized = false;

/**
 * Creates a Hono middleware that transpiles code using esbuild.
 */
export default (
  options: Partial<Omit<Options, "esbuild">> & {
    wasmModule?: WebAssembly.Module;
    wasmURL?: string | URL;
  } = {},
): MiddlewareHandler => {
  return createMiddleware(async (c, next) => {
    if (!initialized) {
      // Use the native esbuild (subprocess) — lib/mod.ts handles Deno natively
      // The lib/wasm.ts path is browser-only (requires WEB_WORKER_FUNCTION globals)
      await esbuild.initialize({});
      initialized = true;
    }
    return await esbuildTranspiler({
      esbuild,
      ...options,
    })(c, next);
  });
};
