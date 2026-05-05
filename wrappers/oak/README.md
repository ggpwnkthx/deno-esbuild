# @ggpwnkthx/esbuild-wrapper-oak

An Oak middleware that on-the-fly transpiles TypeScript and TSX responses using
esbuild.

## Overview

This middleware intercepts responses and transforms `.ts` and `.tsx` response
bodies into JavaScript using esbuild's `tsx` loader. It is designed for
development scenarios where you want to serve Deno TypeScript files directly
without a separate build step.

## Quick Start

```ts
import { Application } from "@oak/oak";
import esbuildMiddleware from "@ggpwnkthx/esbuild-wrapper-oak";

const app = new Application();

// Apply the middleware to all routes
app.use(esbuildMiddleware());

// Your routes returning TypeScript
app.use(async (ctx) => {
  ctx.response.body = `export const value: number = 1;`;
  ctx.response.headers.set("content-type", "application/typescript");
});

export default { fetch: app.handle };
```

## Options

The middleware accepts an optional `Options` object with the following
properties:

| Property           | Type                       | Default             | Description                                                                              |
| ------------------ | -------------------------- | ------------------- | ---------------------------------------------------------------------------------------- |
| `extensions`       | `string[]`                 | `[".ts", ".tsx"]`   | File extensions to intercept and transpile.                                              |
| `cache`            | `boolean`                  | `false`             | Enable in-memory caching of transpiled output.                                           |
| `contentType`      | `string`                   | `"text/javascript"` | Value for the `Content-Type` response header after transpilation.                        |
| `transformOptions` | `esbuild.TransformOptions` | `undefined`         | Additional options passed to `esbuild.transform` (e.g. `loader`, `target`, `sourcemap`). |
| `maxSize`          | `number`                   | `undefined`         | Maximum number of entries in the cache when `cache: true`.                               |
| `ttl`              | `number`                   | `undefined`         | Time-to-live in milliseconds for cached entries when `cache: true`.                      |
| `esbuild`          | `typeof esbuild`           | `undefined`         | Inject a custom esbuild instance (useful for advanced configurations).                   |

### Example with Options

```ts
app.use(
  esbuildMiddleware({
    extensions: [".ts"],
    cache: true,
    maxSize: 100,
    ttl: 60_000, // 1 minute
    contentType: "application/javascript",
    transformOptions: {
      target: "deno1.36",
    },
  }),
);
```

## WASM Variant

For environments where the native esbuild binary is unavailable, use the WASM
variant:

```ts
import { Application } from "@oak/oak";
import esbuildMiddleware from "@ggpwnkthx/esbuild-wrapper-oak/wasm";

const app = new Application();
app.use(esbuildMiddleware());
```

The `/wasm` export wraps the default middleware and initialises esbuild's WASM
backend automatically via `esbuild.initialize({})`. It accepts all the same
`Options` as the default export, plus an optional `wasmModule` or `wasmURL` if
you need to provide a custom WebAssembly module.

```ts
app.use(
  esbuildMiddleware({
    wasmURL: new URL("./esbuild.wasm", import.meta.url),
  }),
);
```

## Exports

| Export    | Description                                                |
| --------- | ---------------------------------------------------------- |
| `default` | Oak middleware using the native esbuild binary.            |
| `./wasm`  | Oak middleware using the esbuild WASM variant.             |
| `Options` | Re-exported type from `@ggpwnkthx/esbuild-wrapper-shared`. |

## How It Works

1. The middleware is mounted in the Oak application.
2. After `next()` is called, it checks whether the request pathname ends with
   one of the configured `extensions`.
3. If so, it reads the response body, runs it through `esbuild.transform()` with
   the `tsx` loader, and replaces the response body with the transpiled
   JavaScript.
4. When `cache: true` is set, results are stored in an in-memory LRU cache keyed
   by pathname. Repeated requests to the same path skip the esbuild call and
   return the cached result directly.
