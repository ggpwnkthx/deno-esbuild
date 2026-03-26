# @ggpwnkthx/esbuild

A Deno-first wrapper around the native `esbuild` binary. This package exposes an async API similar to esbuild's JavaScript API while handling binary installation, service lifecycle, packet-based communication, option validation, and plugin callback bridging.

## When to use this vs official esbuild

**Use this package if:**

- You're building with Deno and want native esbuild support without Node.js compatibility layers
- You prefer Deno's permission model over npm-based tooling
- Your project already uses Deno and you want to avoid adding Node.js as a dependency

**Use the official `esbuild` package instead if:**

- You're using Node.js, Bun, or another Node-compatible runtime
- You need synchronous APIs (`buildSync`, `transformSync`) for `require.extensions` or similar
- You need browser/WASM support via `esbuild-wasm`
- You want zero-configuration usage via npx or a bundler's built-in esbuild integration

This wrapper provides full parity with esbuild's async JavaScript API. The trade-off is loss of sync APIs and browser/WASM support, which are incompatible with Deno's async-first design.

## Installation

```ts
import { build } from "@ggpwnkthx/esbuild";
```

## Required Deno permissions

Because this wrapper downloads binaries, spawns a subprocess, reads sources, and writes outputs, you will need:

- `--allow-net`
- `--allow-env`
- `--allow-read`
- `--allow-write`
- `--allow-run`

```sh
deno run --allow-net --allow-env --allow-read --allow-write --allow-run main.ts
```

## Quick start

### Build a bundle

```ts
import { build } from "@ggpwnkthx/esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  outfile: "dist/app.js",
});
```

### Transform a string

```ts
import { transform } from "@ggpwnkthx/esbuild";

const result = await transform("const answer: number = 42", {
  loader: "ts",
  minify: true,
});

console.log(result.code);
```

### Watch and serve with a context

```ts
import { context } from "@ggpwnkthx/esbuild";

const ctx = await context({
  entryPoints: ["src/index.ts"],
  bundle: true,
  outdir: "dist",
});

await ctx.watch();

const server = await ctx.serve({ port: 8000 });
console.log(`Serving on port ${server.port}`);

// later
await ctx.dispose();
```

### Build with plugins

```ts
import { build, stop } from "@ggpwnkthx/esbuild";

const virtualPlugin = {
  name: "virtual",
  setup(build) {
    build.onResolve({ filter: /^virtual:/ }, (args) => ({
      path: args.path,
      namespace: "virtual",
    }));

    build.onLoad({ filter: /.*/, namespace: "virtual" }, (args) => ({
      contents: `export const message = "hello from virtual module";`,
      loader: "ts",
    }));
  },
};

const result = await build({
  entryPoints: ["virtual:module"],
  bundle: true,
  plugins: [virtualPlugin],
});

console.log(result.outputFiles[0].text);
await stop();
```

### Code splitting with dynamic imports

```ts
import { build, stop } from "@ggpwnkthx/esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  splitting: true,
  format: "esm",
  outdir: "dist",
  sourcemap: true,
});

await stop();
```

## API reference

### Public API

```ts
import {
  analyzeMetafile,
  build,
  context,
  formatMessages,
  initialize,
  stop,
  transform,
  version,
} from "@ggpwnkthx/esbuild";
```

### `build(options)`

Starts or reuses the background esbuild service and runs a build.

Returns warnings and, depending on options, may also return:

- `outputFiles` when `write: false`
- `metafile` when `metafile: true`
- `mangleCache` when configured

### `context(options)`

Creates a persistent build context with support for:

- `rebuild()` - repeat a build
- `watch()` - watch for file changes
- `serve()` - serve the output over HTTP
- `cancel()` - cancel an in-progress build
- `dispose()` - release resources

Use this when you need watch mode, serving, or repeated rebuilds.

### `transform(input, options)`

Transforms a string or `Uint8Array` without requiring entry points. Useful for TypeScript to JavaScript conversion, JSX transforms, minification, and source map generation.

### `formatMessages(messages, options)`

Formats esbuild-style diagnostics into readable strings.

### `analyzeMetafile(metafile, options)`

Produces a human-readable report from a metafile object or JSON string.

### `initialize(options)`

For Deno, this mostly validates usage and ensures the service is running. Browser-only initialization fields such as `wasmURL`, `wasmModule`, and `worker` are rejected.

### `stop()`

Stops the long-lived esbuild service process. Call this when done or use `stop()` in a `finally` block.

### Unsupported synchronous APIs

The following are intentionally unavailable in Deno:

- `buildSync()`
- `transformSync()`
- `formatMessagesSync()`
- `analyzeMetafileSync()`

## Plugin support

Plugins are supported through the channel layer. The wrapper registers plugin hooks in Deno, forwards requests to the native service, and translates results back into typed objects.

Supported plugin lifecycle pieces:

- `setup`
- `onStart`
- `onEnd`
- `onResolve`
- `onLoad`
- `onDispose`
- `build.resolve(...)`

## How it works

At runtime the flow looks like this:

1. `src/api.ts` calls `ensureServiceIsRunning()`
2. `src/install.ts` locates or downloads the matching native `esbuild` binary
3. The binary is launched as a child process using `Deno.Command`
4. Requests and responses are exchanged over stdin/stdout
5. `src/utils/channel.ts` manages service requests, responses, and plugin callbacks
6. `src/utils/byte-buffer.ts` encodes and decodes the binary packet protocol
7. `src/utils/flags.ts` converts TypeScript options into esbuild service flags

## Caveats

- The first run may download the platform-specific `esbuild` binary from npm.
- This implementation keeps a long-lived service process until `stop()` is called or the process exits.
- Large transform inputs may be written to a temp file before being passed to the service.

## Running this repo locally

```sh
deno task fmt        # Format code
deno task lint       # Lint code
deno task check      # Type-check public entrypoint
deno task test       # Run all tests with coverage
deno task ci         # Run all CI checks
```

## Type safety

This package prioritizes type safety:

- **Strict TypeScript mode** - `strict: true` is enabled in `deno.jsonc`
- **No `any` types** - Uses `unknown` with proper type narrowing instead
- **Runtime validation** - All input options are validated via `src/utils/validation.ts`
- **jsr.io dependencies** - All dependencies are pinned from jsr.io with explicit versions
- **Plugin types preserved** - Plugin callbacks are fully typed through `PluginBuild`, `OnResolveArgs`, `OnLoadArgs` and related interfaces
