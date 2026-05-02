import * as esbuild from "esbuild/wasm";
import type { Middleware } from "@oak/oak";
import esbuildTranspiler from "../mod.ts";
import type { Options } from "../../shared.ts";

let initialized = false;

/**
 * Creates an Oak middleware that transpiles code using esbuild WASM.
 */
export default function (
  options: Partial<Omit<Options, "esbuild">> & {
    wasmModule?: WebAssembly.Module;
    wasmURL?: string | URL;
  } = {},
): Middleware {
  return async (ctx, next) => {
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
    await esbuildTranspiler({
      esbuild,
      ...options,
    })(ctx, next);
  };
}
