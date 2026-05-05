# @ggpwnkthx/esbuild

A thin Deno wrapper around the official [esbuild](https://esbuild.github.io/)
binary. Provides the full esbuild JavaScript API for Deno with automatic binary
management.

## Installation

No manual installation required. The package automatically downloads and caches
the esbuild binary for your platform on first use.

```typescript
import * as esbuild from "@ggpwnkthx/esbuild";
```

## Platform support

| Platform | Architecture  | Package                 |
| -------- | ------------- | ----------------------- |
| macOS    | arm64         | `@esbuild/darwin-arm64` |
| macOS    | x64           | `@esbuild/darwin-x64`   |
| Linux    | arm64 (glibc) | `@esbuild/linux-arm64`  |
| Linux    | x64 (glibc)   | `@esbuild/linux-x64`    |
| Windows  | x64           | `@esbuild/win32-x64`    |

The correct binary is selected automatically based on `Deno.build.target`. If
your platform is not listed, the package throws an error.

## API overview

All asynchronous API calls return promises and communicate with the esbuild
service over stdio using the same protocol as the official Node.js bindings.

### `build`

Bundles a set of entry points into output files.

```typescript
import * as esbuild from "@ggpwnkthx/esbuild";

const result = await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  outfile: "dist/bundle.js",
  minify: true,
});

console.log("Build completed:", result);
```

### `context`

Creates a long-lived build context with support for watch mode and a local
development server.

```typescript
import * as esbuild from "@ggpwnkthx/esbuild";

const ctx = await esbuild.context({
  entryPoints: ["src/index.ts"],
  bundle: true,
  outdir: "dist",
});

// Watch for file changes
await ctx.watch();
console.log("Watching for changes...");

// Start a local dev server
const server = await ctx.serve({ servedir: "dist", port: 8000 });
console.log(`Server running at http://localhost:${server.port}`);

// When done, clean up
await ctx.dispose();
```

### `transform`

Transforms a single input string or `Uint8Array` without touching the
filesystem.

```typescript
import * as esbuild from "@ggpwnkthx/esbuild";

const result = await esbuild.transform("const x: number = 1;", {
  loader: "ts",
  minify: true,
});

console.log(result.code);
```

### `formatMessages`

Formats esbuild diagnostic messages for terminal output.

```typescript
import * as esbuild from "@ggpwnkthx/esbuild";

const messages = [
  {
    text: "Something went wrong",
    location: {
      file: "src/index.ts",
      line: 1,
      column: 0,
      lineText: "",
      length: 0,
    },
  },
];
const formatted = await esbuild.formatMessages(messages, { kind: "error" });
console.log(formatted.join("\n"));
```

### `analyzeMetafile`

Pretty-prints an esbuild metafile for inspection.

```typescript
import * as esbuild from "@ggpwnkthx/esbuild";

const result = await esbuild.build({
  entryPoints: ["src/index.ts"],
  metafile: true,
});
const analysis = await esbuild.analyzeMetafile(result.metafile);
console.log(analysis);
```

### `initialize`

Pre-initializes the esbuild service. Usually not needed as the service starts
lazily on first API call.

```typescript
import * as esbuild from "@ggpwnkthx/esbuild";

await esbuild.initialize({});
```

### `stop`

Terminates the esbuild child process and releases resources.

**Important:** Unlike Node.js, Deno does not automatically terminate child
processes on exit. You **must** call `esbuild.stop()` explicitly when you are
done using esbuild, or your Deno process will hang indefinitely. This is
particularly critical in tests — Deno fails tests that leave child processes
running.

```typescript
import * as esbuild from "@ggpwnkthx/esbuild";

// ... use esbuild ...

await esbuild.stop();
```

### Exported types

The package exports all esbuild types for use in TypeScript:

```typescript
import type {
  BuildOptions,
  BuildResult,
  Message,
  Plugin,
  PluginBuild,
  TransformOptions,
  TransformResult,
} from "@ggpwnkthx/esbuild";
```

## Synchronous APIs

The synchronous APIs (`buildSync`, `transformSync`, `formatMessagesSync`,
`analyzeMetafileSync`) are **not supported in Deno** and throw errors if called:

```typescript
import * as esbuild from "@ggpwnkthx/esbuild";

esbuild.buildSync({ entryPoints: ["src/index.ts"] });
// Error: The "buildSync" API does not work in Deno
```

This is a fundamental limitation because synchronous APIs require the Go binary
to block on stdin/stdout, which Deno's permission model does not allow. Use the
async APIs instead.

## WASM variant

For environments where spawning a subprocess is not possible, import the WASM
variant:

```typescript
import * as esbuild from "@ggpwnkthx/esbuild/wasm";

// Must call initialize with a wasmURL or wasmModule before other API calls
await esbuild.initialize({
  wasmURL: new URL("./esbuild.wasm", import.meta.url),
});

const result = await esbuild.build({ entryPoints: ["./src/index.ts"] });
```

Note: The WASM variant requires you to supply the `esbuild.wasm` file yourself
and call `initialize()` before use.

## Environment variables

| Variable              | Description                                                                                   | Default                      |
| --------------------- | --------------------------------------------------------------------------------------------- | ---------------------------- |
| `ESBUILD_BINARY_PATH` | Override the path to the esbuild binary. Use this to supply your own binary or a cached copy. | —                            |
| `NPM_CONFIG_REGISTRY` | npm registry URL for downloading the esbuild package.                                         | `https://registry.npmjs.org` |

### Example: Offline/cached binary

```bash
ESBUILD_BINARY_PATH=/usr/local/bin/esbuild deno run --allow-net --allow-run build.ts
```

### Example: Private registry

```bash
NPM_CONFIG_REGISTRY=https://my-private-registry.example.com deno run --allow-net build.ts
```

## Binary caching

The esbuild binary is downloaded from npm on first use and cached locally:

| OS      | Cache location                                         |
| ------- | ------------------------------------------------------ |
| macOS   | `~/Library/Caches/esbuild/bin`                         |
| Linux   | `$XDG_CACHE_HOME/esbuild/bin` → `~/.cache/esbuild/bin` |
| Windows | `%LOCALAPPDATA%\Cache\esbuild\bin`                     |

The cache path follows the
[XDG Base Directory Specification](https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html)
on Linux. The binary is stored with a version suffix (e.g.,
`esbuild-darwin-arm64@0.28.0`) so multiple versions can coexist.

## CLI usage

The package can also be used as a CLI tool by running the module directly:

```bash
deno run --allow-run -A jsr:@ggpwnkthx/esbuild --bundle --outfile=dist/bundle.js src/index.ts
```

## Version

This wrapper targets the current esbuild version. The wrapped esbuild version is
exported as `esbuild.version`.

```typescript
import { version } from "@ggpwnkthx/esbuild";
console.log("esbuild version:", version);
```
