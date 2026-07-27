# `@ggpwnkthx/esbuild-wrapper-shared`

Shared utility library for Deno esbuild middleware wrappers. Used by both the Hono and Oak esbuild
middleware packages to provide a consistent transformation pipeline with built-in caching support.

## Exports

| Export                 | Type        | Description                                                                           |
| ---------------------- | ----------- | ------------------------------------------------------------------------------------- |
| `createTranspiler`     | `function`  | Creates a transpiler bound to its own in-memory cache.                                |
| `Transpiler`           | `interface` | Shape returned by `createTranspiler`.                                                 |
| `TranspilerOptions`    | `interface` | Per-instance configuration accepted by `createTranspiler`.                            |
| `TranspileRequest`     | `interface` | Per-request options for `Transpiler.getCachedOrTranspile`.                            |
| `EsbuildLike`          | `interface` | Minimal esbuild surface; lets tests inject stand-ins.                                 |
| `Options`              | `interface` | Shared middleware configuration options.                                              |
| `CacheEntry`           | `interface` | Cache entry shape stored for transformed responses.                                   |
| `DEFAULT_EXTENSIONS`   | `string[]`  | `[".ts", ".tsx"]`                                                                     |
| `DEFAULT_CONTENT_TYPE` | `string`    | `"text/javascript"`                                                                   |
| `shouldTranspile`      | `function`  | Checks whether a pathname matches configured extensions.                              |
| `setSuccessResponse`   | `function`  | Sets the transpiled response on a Hono or Oak context.                                |
| `setErrorResponse`     | `function`  | Sets an error response and logs a warning.                                            |
| `Router`               | `class`     | Framework-agnostic ordered route dispatcher.                                          |
| `Route`                | `interface` | Declarative `{ match, handle }` route pair.                                           |
| `RouteContext`         | `interface` | Per-request context passed to every route.                                            |
| `rewriteImports`       | `function`  | AST-based bare-specifier import rewriter.                                             |
| `RewriteOptions`       | `interface` | Options accepted by `rewriteImports`.                                                 |
| `mimeFor`              | `function`  | Returns a MIME type for a file path by lowercased extension.                          |
| `JS_MIME`              | `string`    | `"application/javascript; charset=utf-8"`                                             |
| `DEFAULT_MIME`         | `string`    | `"application/octet-stream"` — fallback returned by `mimeFor` for unknown extensions. |

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

### Version-Based Invalidation

For callers that have a stronger invalidation signal than wall-clock time (e.g. a dev server that
stats the source file on every request), `TranspileRequest.version` lets the cache entry store and
match that signal:

```typescript
const transpiler = createTranspiler({
  cache: true,
  transformOptions: {
    jsx: 'automatic',
    jsxImportSource: 'react',
    format: 'esm',
    target: 'es2022',
  },
})

const { mtime } = await Deno.stat(absPath)
const { code } = await transpiler.getCachedOrTranspile({
  pathname: absPath,
  body: source,
  version: mtime?.getTime(),
})
```

When the cached entry's `version` differs from the incoming `version`, the entry is evicted and the
source is re-transformed. When `version` is `undefined` (or never set), behavior is identical to the
previous release — only TTL or `maxSize` can invalidate the entry. `version` is typed as
`string | number` so any stable identifier (mtime ms, content hash, lockfile revision) works.

### Post-Transform Hook

`TranspileRequest.postProcess` runs after `esbuild.transform` returns. Its return value is what gets
cached and returned to the caller — useful for dev-server pipelines that need to run an additional
step (e.g. the bundled `rewriteImports` helper) before serving the response.

```typescript
const { code } = await transpiler.getCachedOrTranspile({
  pathname: absPath,
  body: source,
  version: mtime?.getTime(),
  postProcess: (transformed) =>
    rewriteImports(transformed, {
      specifier: relPath,
      resolveBareSpecifier: (spec) => allowlist.get(spec),
    }),
})
```

Errors thrown from `postProcess` propagate to the caller; the failing call is **not** cached, so the
next request re-transforms and retries.

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

---

## Route Dispatcher

`Router` is a framework-agnostic ordered route dispatcher: each `Route` is a `{ match, handle }`
pair, and `router.dispatch(req, ctx)` returns the first matching route's response (or a 404). The
`Route` shape is intentionally compatible with both Hono and Oak handlers, so the same route list
can be adapted into either framework through a thin wrapper.

```typescript
import { type Route, Router } from '@ggpwnkthx/esbuild-wrapper-shared'

const routes: Route[] = [
  {
    match: (_req, ctx) => ctx.pathname === '/',
    handle: () => new Response('hello'),
  },
  {
    match: (_req, ctx) => ctx.pathname.endsWith('.ts'),
    handle: async (_req, ctx) => {
      const source = await Deno.readTextFile(`.${ctx.pathname}`)
      return new Response(source, { headers: { 'content-type': 'text/javascript' } })
    },
  },
]

const router = new Router(routes)
const response = await router.dispatch(new Request('http://localhost/'), {
  pathname: '/',
})
```

---

## Import Rewriter

`rewriteImports` parses a JS/TS source string with `@deno/graph`'s `parseModule`, locates the
character spans of bare-specifier imports (e.g. `import x from "react"`), and splices them back in
by absolute character offset with caller-supplied replacement URLs.

Why AST and not regex: bare specifiers can appear inside template literals, comments, or computed
property keys — a string-based search would either miss or mis-locate them. The AST exposes the
source-span of each import's specifier directly.

Why callback-based: a Hono or Oak consumer can map bare specifiers to whatever URL scheme they
prefer (a `/@modules/<spec>` endpoint, a CDN, a local proxy, an import-map server). The example dev
server's allowlist is one possible mapping, not a hard-coded assumption.

```typescript
import { rewriteImports } from '@ggpwnkthx/esbuild-wrapper-shared'

const allowlist = new Map([
  ['react', '/@modules/react'],
  ['react-dom', '/@modules/react-dom'],
])

const source = `import * as React from "react";\nimport { foo } from "./foo.ts";`
const out = await rewriteImports(source, {
  specifier: 'main.tsx',
  defaultJsxImportSource: 'react',
  resolveBareSpecifier: (spec) => allowlist.get(spec),
})
// out: `import * as React from "/@modules/react";\nimport { foo } from "./foo.ts";`
```

`RewriteOptions` fields:

| Key                      | Type                                    | Default               | Description                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | --------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveBareSpecifier`   | `(spec: string) => string \| undefined` | `undefined`           | Map a bare specifier to its replacement URL. Returning `undefined` leaves the specifier untouched (or throws if `throwOnUnresolved` is `true`).                                                                                                                                                                                    |
| `throwOnUnresolved`      | `boolean`                               | `true`                | When `true`, bare specifiers that `resolveBareSpecifier` does not handle throw a loud `Error`.                                                                                                                                                                                                                                     |
| `specifier`              | `string`                                | `"rewriter-input.js"` | Module specifier attached to the parsed module (used for error messages and to work around a `.tsx`/`.ts` AST-span quirk in `@deno/graph@^0.110.2`).                                                                                                                                                                               |
| `defaultJsxImportSource` | `string \| undefined`                   | `"react"`             | JSX import source passed to `parseModule`. Pass `undefined` to disable.                                                                                                                                                                                                                                                            |
| `jsxImportSourceModule`  | `string`                                | `"jsx-runtime"`       | JSX import source module hint passed to `parseModule`.                                                                                                                                                                                                                                                                             |
| `failAsErrorBody`        | `boolean`                               | `false`               | When `true`, errors thrown during rewriting are caught and converted to a `throw new Error("rewrite failed for <specifier>: <message>");` body string instead of propagating. The error is also logged via `console.warn`. Useful for browser-facing dev servers that want to surface failures inline as executable module bodies. |

---

## MIME Helpers

`mimeFor(path)` looks up the `content-type` for a file by its lowercased extension. Returns
`DEFAULT_MIME` (`"application/octet-stream"`) when the extension is unknown. Accepts POSIX and
Windows separators and ignores dots in directory names (so `.gitignore` and `weird.dir.name/file`
are handled correctly).

```typescript
import { JS_MIME, mimeFor } from '@ggpwnkthx/esbuild-wrapper-shared'

const response = new Response(fileBody, {
  headers: { 'content-type': mimeFor('src/index.html') },
})
// mimeFor("Component.tsx") === "application/octet-stream"  (unknown)
// mimeFor("src/main.js")   === "application/javascript; charset=utf-8"
```

Extensions covered: `.html`, `.js`, `.mjs`, `.map`, `.json`, `.css`, `.svg`, `.png`, `.ico`.
