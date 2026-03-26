import { build, stop } from "@ggpwnkthx/esbuild";

await build({
  entryPoints: {
    app: "examples/src/app.ts",
    admin: "examples/src/admin.ts",
    shared: "examples/src/shared.ts",
  },
  bundle: true,
  outdir: "examples/dist",
  format: "esm",
});

console.log("Multiple entry points built!");

await stop();
