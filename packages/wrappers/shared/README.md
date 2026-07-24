# `@ggpwnkthx/esbuild-wrapper-shared`

Shared utility library for Deno esbuild middleware wrappers. Used by both the Hono and Oak esbuild
middleware packages to provide a consistent transformation pipeline with built-in caching support.

## Exports

| Export                 | Type        | Description                                                |
| ---------------------- | ----------- | ---------------------------------------------------------- |
| `createTranspiler`     | `function`  | Creates a transpiler bound to its own in-memory cache.     |
| `Transpiler`           | `interface` | Shape returned by `createTranspiler`.                      |
| `TranspilerOptions`    | `interface` | Per-instance configuration accepted by `createTranspiler`. |
| `TranspileRequest`     | `interface` | Per-request options for `Transpiler.getCachedOrTranspile`. |
| `EsbuildLike`          | `interface` | Minimal esbuild surface; lets tests inject stand-ins.      |
| `Options`              | `interface` | Shared middleware configuration options.                   |
| `CacheEntry`           | `interface` | Cache entry shape stored in the per-instance cache.        |
| `DEFAULT_EXTENSIONS`   | `string[]`  | `[".ts", ".tsx"]`                                          |
| `DEFAULT_CONTENT_TYPE` | `string`    | `"text/javascript"`                                        |
| `shouldTranspile`      | `function`  | Checks whether a pathname matches configured extensions.   |
| `setSuccessResponse`   | `function`  | Sets the transpiled response on a Hono or Oak context.     |
| `setErrorResponse`     | `function`  | Sets an error response and logs a warning.                 |

> **Note (1.0.0):** Prior versions exposed a module-level `responseCache: Map` and a free-standing
> `getCachedOrTranspile` function. The module-level cache and the free function are removed; use
> `createTranspiler` to get an isolated instance.

---

## Caching

Each call to `createTranspiler` returns a `Transpiler` with its own `Map<string, CacheEntry>` cache.
Two eviction strategies are available.

### TTL (Time-To-Live)

Each cached entry carries a `timestamp`. When the entry is retrieved, if a `ttl` was configured and
the elapsed time since `timestamp` exceeds that value, the entry is deleted and re-transpiled on the
next request.

```typescript
const transpiler = createTranspiler({
  cache: true,
  ttl: 60_000,
})
```

### LRU (Least Recently Used) — `maxSize`

When `maxSize` is set and the cache reaches that limit, the entry with the oldest `timestamp` is
evicted to make room for the new entry.

```typescript
const transpiler = createTranspiler({
  cache: true,
  maxSize: 100,
})
```

Both strategies can be used together. TTL checks run on every cache read; `maxSize` checks run on
every cache write. Call `transpiler.clearCache()` to drop every entry at once.

---

## `Options` Interface

```typescript
interface Options {
  /**
   * File extensions that should be transformed. Only paths ending with one of
   * these extensions will be processed.
   * @default [".ts", ".tsx"]
   */
  extensions?: string[]

  /**
   * Enable caching of transformed responses.
   * @default false
   */
  cache?: boolean

  /**
   * The esbuild API to use for transformation. Defaults to the top-level
   * `esbuild` import. Allows injecting a custom esbuild instance (e.g., WASM).
   */
  esbuild?: EsbuildLike

  /**
   * Value for the `content-type` response header after transformation.
   * @default "text/javascript"
   */
  contentType?: string

  /**
   * Additional options passed to `esbuild.transform()` (e.g., `loader`,
   * `jsx`, `target`, `minify`).
   */
  transformOptions?: esbuild.TransformOptions

  /**
   * Maximum number of entries in the cache. When exceeded, the oldest entry
   * is evicted.
   */
  maxSize?: number

  /**
   * Time-to-live for cache entries in milliseconds.
   */
  ttl?: number
}
```

---

## Injecting a Custom `esbuild` Instance

By default, the module imports esbuild from `jsr:@ggpwnkthx/esbuild`. You can supply an alternate
esbuild-compatible instance — for example, a WASM build — via the `esbuild` option:

```typescript
import * as esbuildWasm from 'esbuild-wasm'

const transpiler = createTranspiler({
  cache: true,
  esbuild: esbuildWasm,
})
```

When injecting a custom instance, do **not** call `esbuild.stop()` after transformation if the
injected instance does not support it (most WASM builds do not). Set `shouldStop: false` on the
request:

```typescript
await transpiler.getCachedOrTranspile({
  pathname,
  body,
  shouldStop: false,
})
```

The `transformOptions.loader` defaults to `"tsx"` if not specified. Adjust it to match your injected
instance's expected loader value.

---

## Usage Example

```typescript
import {
  createTranspiler,
  DEFAULT_CONTENT_TYPE,
  DEFAULT_EXTENSIONS,
  type Options,
  setErrorResponse,
  setSuccessResponse,
  shouldTranspile,
} from '@ggpwnkthx/esbuild-wrapper-shared'

const opts: Options = {
  extensions: DEFAULT_EXTENSIONS,
  contentType: DEFAULT_CONTENT_TYPE,
  cache: true,
  maxSize: 200,
  ttl: 30_000,
}

const transpiler = createTranspiler({
  cache: opts.cache,
  esbuild: opts.esbuild,
  transformOptions: opts.transformOptions,
  maxSize: opts.maxSize,
  ttl: opts.ttl,
})

async function handleRequest(
  framework: 'hono' | 'oak',
  ctx: unknown,
  pathname: string,
  body: string,
) {
  if (!shouldTranspile(pathname, opts.extensions)) return

  try {
    const { code } = await transpiler.getCachedOrTranspile({ pathname, body })
    setSuccessResponse(framework, ctx, code, opts.contentType ?? DEFAULT_CONTENT_TYPE)
  } catch (ex) {
    setErrorResponse(
      framework,
      ctx,
      body,
      opts.contentType ?? DEFAULT_CONTENT_TYPE,
      ex,
      pathname,
    )
  }
}
```

---

## Framework Support

`setSuccessResponse` and `setErrorResponse` handle both Hono and Oak contexts automatically:

- **Hono** — manipulates `c.res` directly, replacing the response body and headers.
- **Oak** — manipulates `ctx.response.body` and `ctx.response.headers`.

Pass `"hono"` or `"oak"` as the `framework` argument to select the correct backend.
