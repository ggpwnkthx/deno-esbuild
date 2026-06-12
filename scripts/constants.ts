export const REPO = "https://github.com/evanw/esbuild.git";
export const NAME = "esbuild";
export const WASM = "esbuild.wasm";
export const DEFAULT_OUT_DIR = "./bin";

export const SKIP: ReadonlySet<string> = new Set([
  "platform-all",
  "platform-internal",
  "platform-neutral",
  "platform-deno",
]);
