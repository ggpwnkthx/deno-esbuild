import { build, stop } from "@ggpwnkthx/esbuild";

await build({
  entryPoints: ["examples/src/app.ts"],
  bundle: true,
  splitting: true,
  format: "esm",
  outdir: "examples/dist",
  sourcemap: true,
});

console.log("Build with code splitting complete!");

await stop();
