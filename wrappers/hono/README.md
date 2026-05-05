# `@ggpwnkthx/esbuild-wrapper-hono`

An [esbuild](https://esbuild.github.io/) wrapper that provides an on-the-fly
TypeScript/TSX transpilation middleware for [Hono](https://hono.dev/).

The middleware intercepts responses and transforms `.ts` / `.tsx` bodies to
JavaScript using esbuild's `tsx` loader. It is designed for development servers
that serve Deno TypeScript files directly and need them transpiled to JavaScript
at request time.

## Usage

### Install

```sh
deno add jsr:@ggpwnkthx/esbuild-wrapper-hono
```

### Quick start

```ts
import { Hono } from "hono";
import esbuildMiddleware from "@ggpwnkthx/esbuild-wrapper-hono";

const app = new Hono();

// Apply the middleware globally (or on specific routes)
app.use(esbuildMiddleware());

// Your Deno TypeScript handlers …
app.get("/", (c) => c.text("Hello from Deno!"));

export default { fetch: app.fetch };
```

The middleware assumes downstream middleware or handlers set a response body
with a `content-type` that matches `options.contentType` (default
`"text/javascript"`). Any response whose path ends with a configured extension
(`.ts`, `.tsx` by default) is transpiled via `esbuild.transform` before being
returned.

### Basic options

```ts
import esbuildMiddleware from "@ggpwnkthx/esbuild-wrapper-hono";

// Only transpile .tsx files, skip cache, use default tsx loader
app.use(esbuildMiddleware({
  extensions: [".tsx"],
  cache: false,
}));
```

### Inject custom esbuild (e.g. WASM variant)

```ts
import * as esbuildWasm from "esbuild-wasm";
import esbuildMiddleware from "@ggpwnkthx/esbuild-wrapper-hono";

app.use(esbuildMiddleware({
  esbuild: esbuildWasm as unknown as typeof import("esbuild"),
}));
```

## Options

| Key                | Type                       | Default             | Description                                                                     |
| ------------------ | -------------------------- | ------------------- | ------------------------------------------------------------------------------- |
| `extensions`       | `string[]`                 | `[".ts", ".tsx"]`   | File extensions to intercept and transpile.                                     |
| `cache`            | `boolean`                  | `false`             | Enable in-memory caching of transpiled output.                                  |
| `esbuild`          | `typeof esbuild`           | native esbuild      | Inject a custom esbuild instance (e.g. WASM).                                   |
| `contentType`      | `string`                   | `"text/javascript"` | The `content-type` header value the middleware sets on the transpiled response. |
| `transformOptions` | `esbuild.TransformOptions` | `{}`                | Additional options passed to `esbuild.transform`.                               |
| `maxSize`          | `number`                   | `undefined`         | Maximum number of entries in the cache.                                         |
| `ttl`              | `number`                   | `undefined`         | Time-to-live in milliseconds for cache entries.                                 |

All options are optional. The middleware uses sensible defaults for every value.

## Caching

When `cache: true` is set, the middleware stores transpiled output in an
in-memory `Map` keyed by pathname. You can cap the cache size with `maxSize`
(and optionally expire entries with `ttl` in milliseconds). On a cache hit
`esbuild.transform` is skipped entirely for that request.

## WASM variant

The package exposes a separate export at `./wasm` that uses the native esbuild
binary (via `esbuild.initialize`) instead of the subprocess-based default. This
is useful in environments where spawning subprocesses is not possible.

```ts
import esbuildMiddleware from "@ggpwnkthx/esbuild-wrapper-hono/wasm";

app.use(esbuildMiddleware());
```

`./wasm` accepts the same `Options` as the default export, except `esbuild` is
pre-wired to the native binary. You may also pass `wasmModule` or `wasmURL` to
load a specific WebAssembly module, though in Deno the native binary path is
typically sufficient.

```ts
import esbuildMiddleware from "@ggpwnkthx/esbuild-wrapper-hono/wasm";

// Use a specific WASM binary
app.use(esbuildMiddleware({
  wasmURL: new URL("./esbuild.wasm", import.meta.url),
}));
```

## Re-exports

`Options` is re-exported from the shared package and can be imported directly:

```ts
import type { Options } from "@ggpwnkthx/esbuild-wrapper-hono";
```

## Full example

```ts
import { Hono } from "hono";
import esbuildMiddleware from "@ggpwnkthx/esbuild-wrapper-hono";

const app = new Hono();

app.use(esbuildMiddleware({
  extensions: [".ts", ".tsx"],
  cache: true,
  maxSize: 100,
  ttl: 60_000, // 60 seconds
  contentType: "text/javascript",
  transformOptions: {
    loader: "tsx",
    target: "es2020",
  },
}));

app.get("/hello", (c) => {
  // Return a .ts file's contents as the response body;
  // the middleware will transpile it before sending to the client.
  return c.body(Deno.readFileSync("./hello.ts"), 200, {
    "content-type": "application/typescript",
  });
});

export default { fetch: app.fetch };
```

## License

See [LICENSE.md](./LICENSE.md).
