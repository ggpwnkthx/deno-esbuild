# @ggpwnkthx/esbuild

A Deno wrapper around the official [esbuild](https://esbuild.github.io/) binary.
It exposes esbuild's asynchronous JavaScript API, starts the esbuild service on
demand, and downloads/caches the matching native binary when needed.

This package targets Deno. It does not use npm package metadata or npm registry
downloads for its binary installation path.

## Installation

Import the package from JSR:

```ts
import * as esbuild from "jsr:@ggpwnkthx/esbuild";
```

No manual binary installation is required for supported platforms. On first use,
the package downloads the appropriate release asset, verifies it against the
release `SHA256SUMS` file, stores it in the local cache, and then starts the
esbuild service.

## Required Deno permissions

A first run usually needs these permissions:

```bash
deno run \
  --allow-env \
  --allow-net=github.com \
  --allow-read \
  --allow-write \
  --allow-run \
  build.ts
```

Why:

| Permission               | Used for                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `--allow-env`            | Read `ESBUILD_BINARY_PATH`, cache-location variables, and home-directory variables. |
| `--allow-net=github.com` | Download the binary and `SHA256SUMS` from GitHub releases on a cache miss.          |
| `--allow-read`           | Check the binary cache and read temporary transform outputs.                        |
| `--allow-write`          | Create/update the binary cache and temporary transform files.                       |
| `--allow-run`            | Start the downloaded or configured esbuild executable.                              |

After the binary is cached, you can reduce permissions for your own workflow.
For example, using `ESBUILD_BINARY_PATH` with a preinstalled binary can avoid
network and cache writes, but the binary still has to match the package's
`version` because the JavaScript host and esbuild service perform a version
handshake.

## Platform support

The native entry point chooses a release asset from `Deno.build.target`:

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

Unsupported targets throw an `Unsupported platform: <target>` error.

## Binary download and cache behavior

The native entry point downloads assets from:

```txt
https://github.com/ggpwnkthx/deno-esbuild/releases/download/v${version}/
```

For a given asset, it downloads both the executable and `SHA256SUMS`, verifies
the executable's SHA-256 checksum, and writes the executable to the cache with
executable permissions.

Cache locations:

| OS      | Cache directory                                                                        |
| ------- | -------------------------------------------------------------------------------------- |
| macOS   | `~/Library/Caches/esbuild/bin`                                                         |
| Linux   | `$XDG_CACHE_HOME/esbuild/bin`, or `~/.cache/esbuild/bin`                               |
| Windows | `%LOCALAPPDATA%/Cache/esbuild/bin`, or `%USERPROFILE%/AppData/Local/Cache/esbuild/bin` |

The cached file name includes the esbuild binary version, for example:

```txt
esbuild-linux-x64@0.28.1
```

Set `ESBUILD_BINARY_PATH` to bypass download/cache lookup and run a specific
binary:

```bash
ESBUILD_BINARY_PATH=/usr/local/bin/esbuild deno run \
  --allow-env=ESBUILD_BINARY_PATH \
  --allow-run=/usr/local/bin/esbuild \
  build.ts
```

## API overview

All supported root APIs are asynchronous except for the exported sync variants,
which are present for API compatibility but throw in Deno.

The root entry point exports:

- `version`
- `build`
- `context`
- `transform`
- `formatMessages`
- `analyzeMetafile`
- `initialize`
- `stop`
- `buildSync`, `transformSync`, `formatMessagesSync`, `analyzeMetafileSync` as
  throwing compatibility stubs

### `version`

The esbuild binary version string used by this package.

```ts
import { version } from "jsr:@ggpwnkthx/esbuild";

console.log(version);
```

### `build`

Runs an esbuild build.

```ts
import * as esbuild from "jsr:@ggpwnkthx/esbuild";

try {
  const result = await esbuild.build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    outfile: "dist/bundle.js",
    minify: true,
  });

  console.log("Build completed with", result.warnings.length, "warnings");
} finally {
  await esbuild.stop();
}
```

Call `stop()` when finished. The native service is kept alive between calls for
performance, and Deno does not automatically clean up this child process.

### `context`

Creates a long-lived build context for rebuilds, watch mode, and serve mode.

```ts
import * as esbuild from "jsr:@ggpwnkthx/esbuild";

const ctx = await esbuild.context({
  entryPoints: ["src/index.ts"],
  bundle: true,
  outdir: "dist",
});

try {
  await ctx.watch();

  const server = await ctx.serve({
    servedir: "dist",
    port: 8000,
  });

  console.log(`Serving on http://localhost:${server.port}`);
} finally {
  await ctx.dispose();
  await esbuild.stop();
}
```

### `transform`

Transforms a single string or `Uint8Array`.

```ts
import * as esbuild from "jsr:@ggpwnkthx/esbuild";

try {
  const result = await esbuild.transform("const x: number = 1;", {
    loader: "ts",
    minify: true,
  });

  console.log(result.code);
} finally {
  await esbuild.stop();
}
```

For small inputs, the native implementation sends the input over the service
protocol. For inputs larger than 1 MiB, it tries to use a temporary file for
better performance and falls back to protocol transfer if temporary-file I/O is
unavailable.

### `formatMessages`

Formats esbuild diagnostic messages.

```ts
import * as esbuild from "jsr:@ggpwnkthx/esbuild";

const formatted = await esbuild.formatMessages(
  [{ text: "Unexpected token" }],
  { kind: "error" },
);

console.log(formatted.join("\n"));
```

### `analyzeMetafile`

Formats a metafile returned by a build with `metafile: true`.

```ts
import * as esbuild from "jsr:@ggpwnkthx/esbuild";

try {
  const result = await esbuild.build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    metafile: true,
    write: false,
  });

  const analysis = await esbuild.analyzeMetafile(result.metafile, {
    verbose: true,
  });

  console.log(analysis);
} finally {
  await esbuild.stop();
}
```

### `initialize`

Pre-starts the native esbuild service. This is optional because the service
starts lazily on the first API call.

```ts
import * as esbuild from "jsr:@ggpwnkthx/esbuild";

await esbuild.initialize({});
```

For the native entry point, browser/WASM-only options such as `wasmURL`,
`wasmModule`, and `worker` throw if provided. `initialize()` can only be called
once.

### `stop`

Stops the native esbuild child process.

```ts
import * as esbuild from "jsr:@ggpwnkthx/esbuild";

try {
  await esbuild.build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    outfile: "dist/index.js",
  });
} finally {
  await esbuild.stop();
}
```

Always call and await `stop()` when the native entry point is done, especially
in `Deno.test`, because Deno reports leaked child processes as test failures.

## Exported TypeScript types

The root entry point re-exports this subset of types:

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
} from "jsr:@ggpwnkthx/esbuild";
```

Additional API types are available from the shared types subpath:

```ts
import type {
  AnalyzeMetafileOptions,
  BuildContext,
  BuildFailure,
  BuildResult,
  FormatMessagesOptions,
  Message,
  Metafile,
  OutputFile,
  TransformResult,
} from "jsr:@ggpwnkthx/esbuild/shared/types";
```

## Synchronous APIs

These functions are exported but intentionally unsupported in Deno:

- `buildSync`
- `transformSync`
- `formatMessagesSync`
- `analyzeMetafileSync`

Each one throws an error such as:

```txt
The "buildSync" API does not work in Deno
```

Use the asynchronous APIs instead.

## WASM entry point

Use the WASM entry point when spawning a subprocess is not available:

```ts
import * as esbuild from "jsr:@ggpwnkthx/esbuild/wasm";

await esbuild.initialize({
  wasmURL: new URL("./esbuild.wasm", import.meta.url),
});

const result = await esbuild.transform("let x: number = 1", {
  loader: "ts",
});

console.log(result.code);

await esbuild.stop();
```

The WASM entry point defaults to running in a worker. Pass `worker: false` to
run on the current thread. It has no file-system-backed service, so APIs that
require native filesystem functionality, such as `watch()` and `serve()`, are
not available there.

The package does not bundle `esbuild.wasm`; provide it yourself via `wasmURL` or
`wasmModule`.

## CLI usage

Run the native entry point directly to forward CLI arguments to the esbuild
binary:

```bash
deno run \
  --allow-env \
  --allow-net=github.com \
  --allow-read \
  --allow-write \
  --allow-run \
  jsr:@ggpwnkthx/esbuild \
  --bundle \
  --outfile=dist/bundle.js \
  src/index.ts
```

The first run may need network and cache permissions. Once the binary is cached,
you can narrow permissions to match your environment and command.
