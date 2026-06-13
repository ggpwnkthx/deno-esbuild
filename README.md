# deno-esbuild workspace

Deno-first packages for using [esbuild](https://esbuild.github.io/) in Deno
projects. This repository contains a native esbuild wrapper, a WASM entrypoint,
Deno/CSS esbuild plugins, and Hono/Oak development middleware.

The current workspace package version is `0.2.8`. The bundled esbuild API
targets the esbuild binary version `0.28.1`.

## Packages

| Package                             | Path               | Purpose                                                                                                                                |
| ----------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `@ggpwnkthx/esbuild`                | `esbuild/`         | Deno wrapper around the official esbuild binary, with automatic download, checksum verification, local caching, and a WASM entrypoint. |
| `@ggpwnkthx/esbuild-plugin-deno`    | `plugins/deno/`    | esbuild plugin that delegates module resolution/loading to Deno, including `file:`, `http:`, `https:`, `npm:`, and `jsr:` specifiers.  |
| `@ggpwnkthx/esbuild-plugin-css`     | `plugins/css/`     | esbuild plugin that resolves and inlines local CSS `@import` rules.                                                                    |
| `@ggpwnkthx/esbuild-wrapper-shared` | `wrappers/shared/` | Shared transform, cache, and response helpers used by the framework wrappers.                                                          |
| `@ggpwnkthx/esbuild-wrapper-hono`   | `wrappers/hono/`   | Hono middleware for on-the-fly TypeScript/TSX response transformation.                                                                 |
| `@ggpwnkthx/esbuild-wrapper-oak`    | `wrappers/oak/`    | Oak middleware for on-the-fly TypeScript/TSX response transformation.                                                                  |

## Repository layout

```txt
.
├── deno.json
├── esbuild/
│   ├── mod.ts
│   ├── wasm.ts
│   ├── shared/
│   └── tests/
├── plugins/
│   ├── css/
│   └── deno/
├── scripts/
└── wrappers/
    ├── hono/
    ├── oak/
    └── shared/
```

The root `deno.json` defines the workspace and local development import aliases.
Each package has its own `deno.json`, exports, and package-level tasks.

## Requirements

- Deno 2.x.
- Network access is needed the first time the native wrapper downloads an
  esbuild release asset, unless `ESBUILD_BINARY_PATH` points to an existing
  binary.
- The native API starts a subprocess. Call `stop()` when finished, especially in
  tests, so Deno does not keep running because of an open child process.

## `@ggpwnkthx/esbuild`

Import from JSR:

```ts
import * as esbuild from "jsr:@ggpwnkthx/esbuild@0.2.8";
```

### Basic build

```ts
import * as esbuild from "jsr:@ggpwnkthx/esbuild@0.2.8";

try {
  const result = await esbuild.build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    outfile: "dist/bundle.js",
    minify: true,
  });

  console.log(result.warnings);
} finally {
  await esbuild.stop();
}
```

### Long-running context

```ts
import * as esbuild from "jsr:@ggpwnkthx/esbuild@0.2.8";

const ctx = await esbuild.context({
  entryPoints: ["src/index.ts"],
  bundle: true,
  outdir: "dist",
});

await ctx.watch();

const server = await ctx.serve({
  servedir: "dist",
  port: 8000,
});

console.log(`Serving on port ${server.port}`);

await ctx.dispose();
await esbuild.stop();
```

### Transform

```ts
import * as esbuild from "jsr:@ggpwnkthx/esbuild@0.2.8";

try {
  const result = await esbuild.transform("const value: number = 1;", {
    loader: "ts",
    minify: true,
  });

  console.log(result.code);
} finally {
  await esbuild.stop();
}
```

For large transform inputs, the implementation may use a temporary file for
performance instead of sending the whole payload through stdio. Design callers
so large inputs can be streamed or chunked before calling esbuild when possible.

### Other async APIs

The native package exports these async APIs:

- `build`
- `context`
- `transform`
- `formatMessages`
- `analyzeMetafile`
- `initialize`
- `stop`

The sync APIs are exported for compatibility but throw in Deno:

- `buildSync`
- `transformSync`
- `formatMessagesSync`
- `analyzeMetafileSync`

### Exported types

The root `@ggpwnkthx/esbuild` entrypoint currently re-exports these types:

```ts
import type {
  BuildOptions,
  Loader,
  OnLoadArgs,
  OnLoadResult,
  OnResolveArgs,
  OnResolveResult,
  Platform,
  Plugin,
  PluginBuild,
  TransformOptions,
} from "jsr:@ggpwnkthx/esbuild@0.2.8";
```

Other esbuild type definitions live in the package's shared type module:

```ts
import type {
  BuildResult,
  Message,
  TransformResult,
} from "jsr:@ggpwnkthx/esbuild@0.2.8/shared/types";
```

### Required Deno permissions

A first run commonly needs:

```bash
deno run   --allow-env   --allow-net=github.com   --allow-read   --allow-write   --allow-run   build.ts
```

| Permission               | Why it may be needed                                                 |
| ------------------------ | -------------------------------------------------------------------- |
| `--allow-env`            | Reads cache-related environment variables and `ESBUILD_BINARY_PATH`. |
| `--allow-net=github.com` | Downloads the release asset and `SHA256SUMS` on a cache miss.        |
| `--allow-read`           | Reads the cache, project files, and optional config/input files.     |
| `--allow-write`          | Writes the cached binary and build outputs.                          |
| `--allow-run`            | Runs the cached esbuild binary.                                      |

After the binary is cached, reduce permissions to match the operation you are
performing.

### Supported native release assets

The native wrapper selects a release asset from `Deno.build.target`:

| `Deno.build.target`         | Release asset             |
| --------------------------- | ------------------------- |
| `aarch64-apple-darwin`      | `esbuild-darwin-arm64`    |
| `x86_64-apple-darwin`       | `esbuild-darwin-x64`      |
| `aarch64-unknown-linux-gnu` | `esbuild-linux-arm64`     |
| `x86_64-unknown-linux-gnu`  | `esbuild-linux-x64`       |
| `x86_64-pc-windows-msvc`    | `esbuild-win32-x64.exe`   |
| `aarch64-pc-windows-msvc`   | `esbuild-win32-arm64.exe` |
| `aarch64-linux-android`     | `esbuild-android-arm64`   |
| `x86_64-unknown-freebsd`    | `esbuild-freebsd-x64`     |
| `aarch64-unknown-freebsd`   | `esbuild-freebsd-arm64`   |
| `x86_64-alpine-linux-musl`  | `esbuild-linux-x64`       |

Unsupported targets throw an error before starting the service.

### Binary downloads and cache

Binaries are downloaded from GitHub release assets for this repository and
verified against the release `SHA256SUMS` file before being cached.

Default cache locations:

| OS      | Cache directory                                                                        |
| ------- | -------------------------------------------------------------------------------------- |
| macOS   | `~/Library/Caches/esbuild/bin`                                                         |
| Linux   | `$XDG_CACHE_HOME/esbuild/bin`, or `~/.cache/esbuild/bin`                               |
| Windows | `%LOCALAPPDATA%/Cache/esbuild/bin`, or `%USERPROFILE%/AppData/Local/Cache/esbuild/bin` |

Cached binaries include the esbuild version in the filename, for example:

```txt
esbuild-linux-x64@0.28.1
```

Set `ESBUILD_BINARY_PATH` to bypass download/cache lookup and run a specific
binary:

```bash
ESBUILD_BINARY_PATH=/usr/local/bin/esbuild deno run --allow-run build.ts
```

### CLI forwarding

The package can be run as a CLI. Arguments are forwarded to the esbuild binary:

```bash
deno run   --allow-env   --allow-net=github.com   --allow-read   --allow-write   --allow-run   jsr:@ggpwnkthx/esbuild@0.2.8   --bundle src/index.ts --outfile=dist/bundle.js
```

## WASM API

Use the WASM entrypoint when a subprocess is not available:

```ts
import * as esbuild from "jsr:@ggpwnkthx/esbuild@0.2.8/wasm";

await esbuild.initialize({
  wasmURL: new URL("./esbuild.wasm", import.meta.url),
  worker: true,
});

const result = await esbuild.transform("let x: number = 1", {
  loader: "ts",
});

console.log(result.code);

await esbuild.stop();
```

The WASM entrypoint exports the same async API shape as the native entrypoint.
Sync APIs throw. Browser-style initialization requires either `wasmURL` or
`wasmModule`; the default service path falls back to `esbuild.wasm`.

## `@ggpwnkthx/esbuild-plugin-deno`

This plugin integrates Deno's resolver and loader into esbuild builds.

```ts
import * as esbuild from "jsr:@ggpwnkthx/esbuild@0.2.8";
import { denoPlugin } from "jsr:@ggpwnkthx/esbuild-plugin-deno@0.2.8";

try {
  await esbuild.build({
    entryPoints: ["./main.ts"],
    bundle: true,
    outfile: "./dist/main.js",
    plugins: [
      denoPlugin({
        configPath: "./deno.json",
        publicEnvVarPrefix: "PUBLIC_",
      }),
    ],
  });
} finally {
  await esbuild.stop();
}
```

Options:

| Option               | Description                                                        |
| -------------------- | ------------------------------------------------------------------ |
| `debug`              | Logs resolution and loading decisions.                             |
| `configPath`         | Uses a specific `deno.json` instead of auto-discovery.             |
| `noTranspile`        | Loads source files without Deno transpilation.                     |
| `preserveJsx`        | Keeps JSX instead of transpiling it according to compiler options. |
| `publicEnvVarPrefix` | Inlines matching `Deno.env.get()` values during bundling.          |

Depending on your module graph, this plugin may require file, network, and env
permissions.

## `@ggpwnkthx/esbuild-plugin-css`

This plugin resolves local CSS `@import` rules and inlines the imported content.
External `http:` and `https:` imports are left external.

```ts
import * as esbuild from "jsr:@ggpwnkthx/esbuild@0.2.8";
import { cssPlugin } from "jsr:@ggpwnkthx/esbuild-plugin-css@0.2.8";

try {
  await esbuild.build({
    entryPoints: ["./src/index.ts"],
    bundle: true,
    outdir: "./dist",
    plugins: [cssPlugin()],
  });
} finally {
  await esbuild.stop();
}
```

Options:

| Option     | Description                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| `emitFile` | When true, emits the fully-resolved CSS as a separate output file when CSS is used as an entry point. |

The plugin uses file reads for local CSS imports and may use fetch-style loading
for file URLs before falling back to `Deno.readTextFile`.

## Hono middleware

```ts
import { Hono } from "jsr:@hono/hono@4.12.16";
import esbuildMiddleware from "jsr:@ggpwnkthx/esbuild-wrapper-hono@0.2.8";

const app = new Hono();

app.use(
  "*",
  esbuildMiddleware({
    extensions: [".ts", ".tsx"],
    cache: true,
    maxSize: 100,
    ttl: 30_000,
    transformOptions: {
      target: "es2022",
    },
  }),
);

app.get("/example.ts", (c) => c.text("export const value: number = 1;"));

export default app;
```

The Hono wrapper checks the request pathname against the configured extensions,
reads `c.res.text()` after downstream middleware runs, transforms the body with
esbuild, and updates the response content type. By default, transformed
responses use `text/javascript`.

## Oak middleware

```ts
import { Application } from "jsr:@oak/oak@17";
import esbuildMiddleware from "jsr:@ggpwnkthx/esbuild-wrapper-oak@0.2.8";

const app = new Application();

app.use(
  esbuildMiddleware({
    extensions: [".ts", ".tsx"],
    cache: true,
    transformOptions: {
      target: "es2022",
    },
  }),
);

export default {
  fetch: app.handle,
};
```

The Oak wrapper checks the request pathname after downstream middleware runs,
reads `ctx.request.body.text()`, and writes transformed code to
`ctx.response.body`. This reflects the current implementation; verify that this
matches your server's request/response flow before using it in production.

## Shared wrapper options

The Hono and Oak wrappers share the same `Options` shape from
`@ggpwnkthx/esbuild-wrapper-shared`.

| Option             | Default               | Description                                                       |
| ------------------ | --------------------- | ----------------------------------------------------------------- |
| `extensions`       | `[".ts", ".tsx"]`     | Path suffixes that should be transformed.                         |
| `cache`            | `false`               | Enables the in-memory transform cache.                            |
| `esbuild`          | native wrapper import | Injects a custom esbuild API object, such as a WASM instance.     |
| `contentType`      | `"text/javascript"`   | Content type set after transformation.                            |
| `transformOptions` | `{}`                  | Extra options passed to `esbuild.transform()`.                    |
| `maxSize`          | unlimited             | Maximum cache entries; the oldest entry is evicted when exceeded. |
| `ttl`              | no expiry             | Cache entry time-to-live in milliseconds.                         |

The shared package also exports:

- `responseCache`
- `DEFAULT_EXTENSIONS`
- `DEFAULT_CONTENT_TYPE`
- `shouldTranspile`
- `getCachedOrTranspile`
- `setSuccessResponse`
- `setErrorResponse`
- `CacheEntry`
- `TranspileOptions`
- `Options`

## Development

Root workspace tasks:

```bash
deno task bin:list
deno task bin:build
```

Package-level tasks are defined in each package directory:

```bash
cd esbuild
deno task fmt
deno task lint
deno task check
deno task test
```

The native binary build script requires read/write access, access to `git` and
`go`, and environment access:

```bash
deno task bin:build
```

## Notes and constraints

- The native API is async-only in Deno. Sync compatibility exports throw.
- Always call `stop()` after native or WASM API usage unless a long-lived server
  intentionally keeps the service alive.
- The native wrapper stores downloaded binaries outside the repository in the OS
  cache directory.
- The wrapper cache is process-local memory. It is not persisted across
  restarts.
- Large esbuild outputs and metafiles can be memory-heavy. Prefer writing output
  files to disk or processing metafiles deliberately instead of retaining many
  build results in memory.
