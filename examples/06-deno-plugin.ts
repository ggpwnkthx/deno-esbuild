import { build, denoPlugin, stop } from "@ggpwnkthx/esbuild";

const result = await build({
  entryPoints: ["./src/app.ts"],
  bundle: true,
  plugins: [denoPlugin()],
  outfile: "./dist/app.js",
});

console.log("Build completed with", result.errors.length, "errors");

await stop();
