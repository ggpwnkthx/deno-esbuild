import { build, stop } from "@ggpwnkthx/esbuild";
import type { OnLoadArgs, OnResolveArgs, PluginBuild } from "@ggpwnkthx/esbuild";

const virtualPlugin = {
  name: "virtual",
  setup(build: PluginBuild) {
    build.onResolve({ filter: /^virtual:/ }, (args: OnResolveArgs) => ({
      path: args.path,
      namespace: "virtual",
    }));

    build.onLoad({ filter: /.*/, namespace: "virtual" }, (_args: OnLoadArgs) => ({
      contents: `export const message = "hello from virtual module";`,
      loader: "ts",
    }));
  },
};

const result = await build({
  entryPoints: ["virtual:module"],
  bundle: true,
  plugins: [virtualPlugin],
  write: false,
});

console.log("Build result:", result.outputFiles[0].text);

await stop();
