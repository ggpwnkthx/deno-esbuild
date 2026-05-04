import * as esbuild from "esbuild";
import type { Middleware } from "@oak/oak";
import esbuildTranspiler from "../mod.ts";
import type { Options } from "../../shared.ts";

let initialized = false;

/**
 * Creates an Oak middleware that transpiles code using esbuild.
 */
export default function (
  options: Partial<Omit<Options, "esbuild">> & {
    wasmModule?: WebAssembly.Module;
    wasmURL?: string | URL;
  } = {},
): Middleware {
  return async (ctx, next) => {
    if (!initialized) {
      // Initialize with defaults - works in all contexts including workers
      await esbuild.initialize({});
      initialized = true;
    }
    await esbuildTranspiler({
      esbuild,
      ...options,
    })(ctx, next);
  };
}
