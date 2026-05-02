import * as esbuild from "esbuild/wasm";
import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import esbuildTranspiler from "../mod.ts";
import type { Options } from "../../shared.ts";

let initialized = false;

/**
 * Creates a Hono middleware that transpiles code using esbuild WASM.
 */
export default (
  options: Partial<Omit<Options, "esbuild">> & {
    wasmModule?: WebAssembly.Module;
    wasmURL?: string | URL;
  } = {},
): MiddlewareHandler => {
  return createMiddleware(async (c, next) => {
    if (!initialized) {
      if (options.wasmModule) {
        await esbuild.initialize({
          wasmModule: options.wasmModule,
          worker: false,
        });
      } else {
        await esbuild.initialize({
          wasmURL: options.wasmURL
            ?? "https://deno.land/x/esbuild@v0.28.0/esbuild.wasm",
          worker: false,
        });
      }
      initialized = true;
    }
    return await esbuildTranspiler({
      esbuild,
      ...options,
    })(c, next);
  });
};
