# `@ggpwnkthx/esbuild-wrapper-shared`

Shared utility library for Deno esbuild middleware wrappers. Used by both the
Hono and Oak esbuild middleware packages to provide a consistent transformation
pipeline with built-in caching support.

## Exports

| Export                 | Type                      | Description                                                  |
| ---------------------- | ------------------------- | ------------------------------------------------------------ |
| `responseCache`        | `Map<string, CacheEntry>` | In-memory cache for transpiled responses, keyed by pathname. |
| `Options`              | `interface`               | Shared middleware configuration options.                     |
| `DEFAULT_EXTENSIONS`   | `string[]`                | `[".ts", ".tsx"]`                                            |
| `DEFAULT_CONTENT_TYPE` | `string`                  | `"text/javascript"`                                          |
| `shouldTranspile`      | `function`                | Checks whether a pathname matches configured extensions.     |
| `getCachedOrTranspile` | `function`                | Returns cached code or transpiles and caches the result.     |
| `setSuccessResponse`   | `function`                | Sets the transpiled response on a Hono or Oak context.       |
| `setErrorResponse`     | `function`                | Sets an error response and logs a warning.                   |

---

## The Caching Mechanism

The shared module uses an in-memory `Map<string, CacheEntry>` to store
transformation results. Two eviction strategies are available:

### TTL (Time-To-Live)

Each cached entry carries a `timestamp`. When the entry is retrieved, if a `ttl`
was configured and the elapsed time since `timestamp` exceeds that value, the
entry is deleted and re-transpiled on the next request.

```typescript
// Example: entries expire after 60 seconds
const opts: Options = {
  cache: true,
  ttl: 60_000,
};
```

### LRU (Least Recently Used) — `maxSize`

When `maxSize` is set and the cache reaches that limit, the entry with the
oldest `timestamp` is evicted to make room for the new entry.

```typescript
// Example: keep at most 100 entries in the cache
const opts: Options = {
  cache: true,
  maxSize: 100,
};
```

Both strategies can be used together. TTL checks run on every cache read;
`maxSize` checks run on every cache write.

---

## `Options` Interface

```typescript
interface Options {
  /**
   * File extensions that should be transformed. Only paths ending with one of
   * these extensions will be processed.
   * @default [".ts", ".tsx"]
   */
  extensions?: string[];

  /**
   * Enable caching of transformed responses.
   * @default false
   */
  cache?: boolean;

  /**
   * The esbuild API to use for transformation. Defaults to the top-level
   * `esbuild` import. Allows injecting a custom esbuild instance (e.g., WASM).
   */
  esbuild?: typeof esbuild;

  /**
   * Value for the `content-type` response header after transformation.
   * @default "text/javascript"
   */
  contentType?: string;

  /**
   * Additional options passed to `esbuild.transform()` (e.g., `loader`,
   * `jsx`, `target`, `minify`).
   */
  transformOptions?: esbuild.TransformOptions;

  /**
   * Maximum number of entries in the cache. When exceeded, the oldest entry
   * is evicted.
   */
  maxSize?: number;

  /**
   * Time-to-live for cache entries in milliseconds.
   */
  ttl?: number;
}
```

---

## Injecting a Custom `esbuild` Instance

By default, the module imports esbuild from `jsr:@ggpwnkthx/esbuild`. You can
supply an alternate esbuild-compatible instance — for example, a WASM build —
via the `esbuild` option:

```typescript
import * as esbuildWasm from "esbuild-wasm";

const opts: Options = {
  cache: true,
  esbuild: esbuildWasm,
  // WASM builds typically require initializing before use:
  transformOptions: {
    loader: "tsx",
    // ...
  },
};
```

When injecting a custom instance, be aware of two differences from the default
native binary:

1. **Do not call `esbuild.stop()`** after transformation if the injected
   instance does not support it (most WASM builds do not). The
   `getCachedOrTranspile` function accepts a `shouldStop` flag (defaulting to
   `true`) to control this behavior. Set it to `false` when using WASM:

   ```typescript
   await getCachedOrTranspile({
     // ...
     esbuild: esbuildWasm,
     shouldStop: false, // WASM instances should not be stopped
   });
   ```

2. The `transformOptions.loader` defaults to `"tsx"` if not specified. Adjust it
   to match your injected instance's expected loader value.

---

## Usage Example

```typescript
import {
  DEFAULT_CONTENT_TYPE,
  DEFAULT_EXTENSIONS,
  getCachedOrTranspile,
  responseCache,
  setErrorResponse,
  setSuccessResponse,
  shouldTranspile,
} from "@ggpwnkthx/esbuild-wrapper-shared";

const opts = {
  extensions: DEFAULT_EXTENSIONS,
  contentType: DEFAULT_CONTENT_TYPE,
  cache: true,
  maxSize: 200,
  ttl: 30_000,
};

async function handleRequest(
  framework: "hono" | "oak",
  ctx: unknown,
  pathname: string,
  body: string,
) {
  if (!shouldTranspile(pathname, opts.extensions)) return;

  const { code } = await getCachedOrTranspile({
    pathname,
    body,
    cache: opts.cache ?? false,
    maxSize: opts.maxSize,
    ttl: opts.ttl,
    transformOptions: opts.transformOptions,
    esbuild: opts.esbuild,
    shouldStop: true,
  });

  setSuccessResponse(
    framework,
    ctx,
    code,
    opts.contentType ?? DEFAULT_CONTENT_TYPE,
  );
}
```

---

## Framework Support

`setSuccessResponse` and `setErrorResponse` handle both Hono and Oak contexts
automatically:

- **Hono** — manipulates `c.res` directly, replacing the response body and
  headers.
- **Oak** — manipulates `ctx.response.body` and `ctx.response.headers`.

Pass `"hono"` or `"oak"` as the `framework` argument to select the correct
backend.
