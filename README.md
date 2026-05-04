# deno-esbuild

A thin wrapper around the official [esbuild](https://deno.land/x/esbuild) Deno
package, adding Deno-specific conveniences: a first-class Deno plugin and
framework middleware wrappers (Hono, Oak) for on-the-fly transpilation.

## Exports

| Export               | Description                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `mod.ts`             | Re-exports all esbuild exports (passthru from `deno.land/x/esbuild`)                     |
| `plugins/deno`       | Deno plugin for esbuild - handles import resolution, transpilation, and env var inlining |
| `wrappers/hono`      | Hono middleware using the native esbuild binary                                          |
| `wrappers/hono/wasm` | Hono middleware using esbuild's WASM build                                               |
| `wrappers/oak`       | Oak middleware using the native esbuild binary                                           |
| `wrappers/oak/wasm`  | Oak middleware using esbuild's WASM build                                                |

---

## Quick start

### `mod.ts` - esbuild passthru

Import everything esbuild exports directly:

```ts
import * as esbuild from "@ggpwnkthx/esbuild";

const result = await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  outfile: "dist/bundle.js",
});
```

### `plugins/deno` - Deno plugin

Use the Deno plugin to build Deno projects with proper resolution of `file:`,
`https:`, `jsr:`, `npm:`, and other Deno-specific schemes.

```ts
import * as esbuild from "esbuild";
import { denoPlugin } from "@ggpwnkthx/esbuild/plugins/deno";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  outfile: "dist/bundle.js",
  plugins: [denoPlugin()],
});
```

**Options**

```ts
denoPlugin({
  /** Path to a deno.json to use instead of auto-discovering one */
  configPath?: string;
  /** Skip transpilation (load raw source) */
  noTranspile?: boolean;
  /** Keep JSX as-is instead of transpiling via compilerOptions */
  preserveJsx?: boolean;
  /** Prefix for public env vars to inline at build time (e.g. "PUBLIC_") */
  publicEnvVarPrefix?: string;
});
```

The plugin handles:

- **Import resolution** - `file:`, `https:`, `jsr:`, `npm:` and more
- **Transpilation** - TypeScript/TSX → JavaScript via Deno's loader
- **Env var inlining** - Replaces `Deno.env.get("PUBLIC_*")` with string
  literals when `publicEnvVarPrefix` is set

### `wrappers/hono` - Native esbuild middleware

On-the-fly transpilation for Hono servers using the native esbuild binary:

```ts
import { Hono } from "hono";
import transpiler from "@ggpwnkthx/esbuild/wrappers/hono";

const app = new Hono();

app.use(transpiler());

app.get(
  "/",
  (c) => c.html(`<script type="module" src="/static/app.ts"></script>`),
);

await app.fetch(request);
```

Requests to `/static/app.ts` (or any `.ts`/`.tsx` path) are transpiled and
served as JavaScript.

### `wrappers/hono/wasm` - WASM esbuild middleware

Same as above but uses esbuild's WASM build - useful in environments where the
native binary is unavailable:

```ts
import { Hono } from "hono";
import transpiler from "@ggpwnkthx/esbuild/wrappers/hono/wasm";

const app = new Hono();

app.use(transpiler({
  /** Optional: custom esbuild.wasm WebAssembly module */
  wasmModule?: WebAssembly.Module;
  /** Optional: URL to esbuild.wasm (defaults to deno.land CDN) */
  wasmURL?: string | URL;
}));

// ...
```

### `wrappers/oak` - Native esbuild middleware

On-the-fly transpilation for Oak servers using the native esbuild binary:

```ts
import { Application } from "@oak/oak";
import transpiler from "@ggpwnkthx/esbuild/wrappers/oak";

const app = new Application();

app.use(transpiler());

app.use(async (ctx) => {
  ctx.response.body = `<script type="module" src="/static/app.ts"></script>`;
});

export default { fetch: app.handle };
```

Requests to `/static/app.ts` (or any `.ts`/`.tsx` path) are transpiled and
served as JavaScript.

### `wrappers/oak/wasm` - WASM esbuild middleware

Same as above but uses esbuild's WASM build - useful in environments where the
native binary is unavailable:

```ts
import { Application } from "@oak/oak";
import transpiler from "@ggpwnkthx/esbuild/wrappers/oak/wasm";

const app = new Application();

app.use(transpiler({
  /** Optional: custom esbuild.wasm WebAssembly module */
  wasmModule?: WebAssembly.Module;
  /** Optional: URL to esbuild.wasm (defaults to deno.land CDN) */
  wasmURL?: string | URL;
}));

// ...
```
