import { join as joinRel } from "@std/path/posix";

export const REPO = "https://github.com/evanw/esbuild.git";
export const NAME = "esbuild";
export const WASM = "esbuild.wasm";
export const WASM_RELPATH = joinRel("bin", "js", "wasm", WASM);
export const MAX = 20 * 1024 * 1024;
export const SKIP = new Set([
  "platform-all",
  "platform-internal",
  "platform-neutral",
  "platform-deno",
]);
