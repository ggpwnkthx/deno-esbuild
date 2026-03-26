import { build, stop } from "@ggpwnkthx/esbuild";

const result = await build({
  stdin: {
    contents: `
      const message: string = "Hello from stdin!";
      console.log(message);
      export { message };
    `,
    sourcefile: "entry.ts",
    loader: "ts",
  },
  bundle: true,
  outdir: "examples/dist",
  write: true,
});

console.log(result.errors.length === 0 ? "Build succeeded" : "Build failed");

await stop();
