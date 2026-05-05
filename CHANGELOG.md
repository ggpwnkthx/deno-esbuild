# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.4]

### Added

- JSDoc documentation to all exported functions in `esbuild/mod.ts`
- JSDoc documentation to module-level and all exported functions in
  `esbuild/wasm.ts`
- JSDoc documentation to `ESBUILD_VERSION`, `validateInitializeOptions`,
  `StreamIn`, `StreamOut`, `StreamFS`, `Refs`, `StreamService`, and
  `createChannel` in `esbuild/shared/common.ts`
- JSDoc documentation to all protocol interface types and helper functions in
  `esbuild/shared/stdio_protocol.ts`
- JSDoc documentation to `JSON_parse` in
  `esbuild/shared/uint8array_json_parser.ts`
- Named type re-exports with `/** @see ... */` JSDoc cross-links in
  `esbuild/mod.ts` and `esbuild/wasm.ts`

### Changed

- Deno version pinned in CI updated from 2.7.7 to 2.7.14
- CI workflow restructured from matrix job to three sequential jobs (esbuild →
  plugins → wrappers) with explicit dependency ordering

## [0.2.3]

### Fixed

- CI/CD workflow rewired from a single combined job into a per-package matrix,
  running fmt, lint, check, and test independently in each package directory
- Removed the `.github/scripts/update-esbuild.ts` auto-updater script as it was
  causing issues and is not needed

### Changed

- GitHub Actions updated to use `denoland/setup-deno@v2` and
  `actions/checkout@v4`

## [0.2.2]

### Added

- JSDoc module documentation for all package entry points: `esbuild/mod.ts`,
  `plugins/deno/mod.ts`, `plugins/css/mod.ts`, `wrappers/hono/mod.ts`,
  `wrappers/oak/mod.ts`, `wrappers/shared/mod.ts`, and all shared internal
  modules

### Changed

- README.md rewritten with a monorepo overview table, package-by-package
  examples, shared exports table, and environment variables section
- All packages bumped to version 0.2.2; cross-package import versions updated to
  `jsr:@ggpwnkthx/esbuild@0.2.2`

## [0.2.1]

### Changed

- Project split into six independently versioned JSR packages; the root no
  longer exports any code directly
- The core `esbuild` package (`jsr:@ggpwnkthx/esbuild@0.2.1`) exposes the full
  esbuild API (build, context, transform, formatMessages, analyzeMetafile,
  initialize, stop) and now also exports `shared/common`,
  `shared/stdio_protocol`, `shared/types`, `shared/uint8array_json_parser`,
  `shared/worker`, and `wasm` sub-paths
- Plugin packages (`esbuild-plugin-deno`, `esbuild-plugin-css`) now import the
  core package via `jsr:@ggpwnkthx/esbuild@0.2.0`
- Wrapper packages (`esbuild-wrapper-hono`, `esbuild-wrapper-oak`) now import
  the shared utilities via `jsr:@ggpwnkthx/esbuild-wrapper-shared@^0.2.0`
  instead of a relative path

### Removed

- Root `mod.ts` no longer exists; import from the appropriate package instead
- `plugins/utils.ts` removed; utilities moved into `plugins/deno/utils.ts`

## [0.2.0]

### Changed

- Complete rewrite replacing low-level IPC/channel/codec machinery with
  Deno-native plugins and framework middleware
- `mod.ts` root now a thin passthrough re-exporting from `plugins/`

### Added

- `plugins/deno.ts` (284 lines): Deno plugin handling resolution of `file:`,
  `https:`, `jsr:`, `npm:`, `node:` specifiers, transpilation, env var inlining,
  and binary asset exclusion
- `plugins/css.ts` (154 lines): CSS plugin handling `@import` chains and `url()`
  syntax, marks remote imports as external
- `plugins/html.ts` (99 lines): HTML plugin bundling HTML with inline
  script/style tags
- `plugins/utils.ts` (95 lines): Shared plugin utilities
- `wrappers/shared.ts` (225 lines): In-memory LRU response cache with TTL,
  shared by both Hono and Oak middleware
- `wrappers/hono/mod.ts` (69 lines): Hono middleware wrapper with WASM
  transpiler variant
- `wrappers/hono/transpilers/wasm.ts` (39 lines): WASM transpiler for Hono
- `wrappers/oak/mod.ts` (71 lines): Oak middleware wrapper with WASM transpiler
  variant
- `wrappers/oak/transpilers/wasm.ts` (38 lines): WASM transpiler for Oak
- `deno.jsonc` updated to use JSR-managed dependencies: `@deno/loader`,
  `jsr:@hono/hono`, `jsr:@oak/oak`

### Removed

- All `src/` contents (api.ts, install.ts, mod.ts, native.ts, types.ts)
- All `src/utils/` contents (byte-buffer.ts, channel.ts, codec.ts, flags.ts,
  misc.ts, validation.ts)
- All `src/plugins/` and `tests/` contents including api.test.ts,
  install.test.ts, and the full tests/utils/ tree

## [0.1.6-rc.0]

### Fixed

- `stop()` now properly waits for channel cleanup before returning, preventing
  resource leaks during tests.
- Added `waitForClose()` method to channel to ensure all pending callbacks are
  resolved before shutdown.
- Added timeout fallback with force kill to prevent `stop()` from hanging
  indefinitely.

## [0.1.5]

### Fixed

- `handleRequest` now runs synchronously and catches promise rejections from
  callbacks instead of awaiting them, preventing potential hangs when context
  methods' callbacks throw.
- Fixed 3 context method tests that awaited `ctx.dispose()` without injecting
  the dispose response packet, causing tests to hang.

## [0.1.4]

### Changed

- Broke up large test files into smaller, more maintainable files:
  - `channel.test.ts` (1392 lines) split into 5 files in `tests/utils/channel/`
  - `validation.test.ts` (467 lines) split into 4 files in
    `tests/utils/validation/`
  - `misc.test.ts` (408 lines) split into 4 files in `tests/utils/misc/`
  - Removed placeholder `simple.test.ts`
- Created shared `_helpers.ts` modules to reduce code duplication in channel
  tests.

## [0.1.3]

### Added

- New `./native` export exposing esbuild's native JavaScript API for direct
  access.

### Changed

- Improved `installFromNPM` with proper fetch error handling.
- Improved `extractFileFromTarGzip` decompression using Blob streams.
- Fixed test assertions to use `assertRejects` instead of deprecated patterns.
- Fixed watch/serve tests with proper async cleanup and null assertions.

## [0.1.2]

### Added

- Module documentation for all entrypoints (`src/install.ts`,
  `src/utils/mod.ts`).
- JSDoc documentation for all exported symbols across the codebase.

## [0.1.1]

### Added

- JSR publishing workflow.

## [0.1.0]

### Added

- Initial code.
- Feature parity with esbuild.
