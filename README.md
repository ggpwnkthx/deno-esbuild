# deno-esbuild

A Deno-first esbuild monorepo. The root package wraps the official esbuild
binary for Deno; sub-packages add a Deno-resolution esbuild plugin, a CSS import
resolver, and framework middleware wrappers for Hono and Oak.

## Packages

| Package                                 | JSR                                                                                   | Description                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [`esbuild`](./esbuild/)                 | [@ggpwnkthx/esbuild](https://jsr.io/@ggpwnkthx/esbuild)                               | Deno wrapper around the esbuild binary                       |
| [`plugins/deno`](./plugins/deno/)       | [@ggpwnkthx/esbuild-plugin-deno](https://jsr.io/@ggpwnkthx/esbuild-plugin-deno)       | esbuild plugin with Deno import resolution and transpilation |
| [`plugins/css`](./plugins/css/)         | [@ggpwnkthx/esbuild-plugin-css](https://jsr.io/@ggpwnkthx/esbuild-plugin-css)         | esbuild plugin that resolves and inlines CSS `@import` rules |
| [`wrappers/hono`](./wrappers/hono/)     | [@ggpwnkthx/esbuild-wrapper-hono](https://jsr.io/@ggpwnkthx/esbuild-wrapper-hono)     | Hono middleware for on-the-fly TypeScript transpilation      |
| [`wrappers/oak`](./wrappers/oak/)       | [@ggpwnkthx/esbuild-wrapper-oak](https://jsr.io/@ggpwnkthx/esbuild-wrapper-oak)       | Oak middleware for on-the-fly TypeScript transpilation       |
| [`wrappers/shared`](./wrappers/shared/) | [@ggpwnkthx/esbuild-wrapper-shared](https://jsr.io/@ggpwnkthx/esbuild-wrapper-shared) | Shared utilities used by both middleware wrappers            |

## Quick start

### esbuild core

```ts
import * as esbuild from "@ggpwnkthx/esbuild";

const result = await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  outfile: "dist/bundle.js",
});
```

### Deno plugin

```ts
import * as esbuild from "esbuild";
import { denoPlugin } from "@ggpwnkthx/esbuild-plugin-deno";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  plugins: [denoPlugin({ publicEnvVarPrefix: "PUBLIC_" })],
});
```

### CSS plugin

```ts
import * as esbuild from "esbuild";
import { cssPlugin } from "@ggpwnkthx/esbuild-plugin-css";

await esbuild.build({
  entryPoints: ["./src/index.ts"],
  bundle: true,
  plugins: [cssPlugin()],
});
```

### Hono middleware

```ts
import { Hono } from "hono";
import transpiler from "@ggpwnkthx/esbuild-wrapper-hono";

const app = new Hono();
app.use(transpiler());

app.get(
  "/",
  (c) => c.html(`<script type="module" src="/static/app.ts"></script>`),
);

export default { fetch: app.fetch };
```

### Oak middleware

```ts
import { Application } from "@oak/oak";
import transpiler from "@ggpwnkthx/esbuild-wrapper-oak";

const app = new Application();
app.use(transpiler());

app.use(async (ctx) => {
  ctx.response.body = `<script type="module" src="/static/app.ts"></script>`;
});

export default { fetch: app.handle };
```

## Shared exports

| Export                                        | Where             | Description                    |
| --------------------------------------------- | ----------------- | ------------------------------ |
| `build`, `context`, `transform`, etc.         | `esbuild`         | Full esbuild async API         |
| `denoPlugin`                                  | `plugins/deno`    | Deno-resolution esbuild plugin |
| `cssPlugin`                                   | `plugins/css`     | CSS `@import` resolver plugin  |
| `DEFAULT_EXTENSIONS`, `shouldTranspile`, etc. | `wrappers/shared` | Shared middleware utilities    |

## Environment variables

| Variable              | Package   | Description                                   |
| --------------------- | --------- | --------------------------------------------- |
| `ESBUILD_BINARY_PATH` | `esbuild` | Override path to the esbuild binary           |
| `NPM_CONFIG_REGISTRY` | `esbuild` | npm registry for downloading esbuild binaries |

See each package's `README.md` for full documentation.
