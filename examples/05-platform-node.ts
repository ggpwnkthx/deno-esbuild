import { build, stop } from "@ggpwnkthx/esbuild";

await build({
  entryPoints: ["examples/src/app.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "examples/dist/index.cjs",
  external: ["fs", "path", "crypto"],
});

console.log("Node-specific build complete!");

await stop();
