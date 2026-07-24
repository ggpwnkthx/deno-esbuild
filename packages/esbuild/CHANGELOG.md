# Changelog

All notable changes to `@ggpwnkthx/esbuild` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- JSDoc documentation on the remaining previously undocumented exports:
  - `shared/types.ts`: type aliases `Platform`, `Format`, `Loader`, `LogLevel`, `Charset`, `Drop`,
    `AbsPaths`, and `ImportKind`.
  - `shared/types.ts`: interfaces `TsconfigRaw`, `BuildOptions`, `StdinOptions`, `Message`, `Note`,
    `Location`, `OutputFile`, `BuildResult`, `BuildFailure`, `ServeOnRequestArgs`,
    `TransformOptions`, `TransformResult`, `TransformFailure`, `Plugin`, `PluginBuild`,
    `OnStartResult`, `OnEndResult`, `PartialMessage`, `PartialNote`, `BuildContext`, and
    `InitializeOptions`.
  - `shared/types.ts`: one-line summary on the `version` declaration, and the 16-line `//` comment
    above `stop()` converted verbatim into a `/** */` block.
  - `shared/worker.ts`: `WorkerInputMessage` and `GoWasmRuntimeHandle`.

## [0.2.10] - 2026-07-24

### Changed

- Last synchronized version bump across all `@ggpwnkthx/*` packages in this workspace. Future
  versions of this package will be released independently.

## [0.2.9] - 2026-07-24

### Changed

- Synchronized version bump across all `@ggpwnkthx/*` packages in this workspace.
- Repo-wide `deno fmt` style sweep (`singleQuote`, no `semiColons`, `lineWidth` 100) applied across
  `mod.ts`, `wasm.ts`, and all `shared/*.ts` files.
- Strict `compilerOptions` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`) adopted in this package's `deno.json`.

## [0.2.8] - 2026-06-13

### Added

- `shared/go_wasm.ts`: typed Go WASM runtime shim adapted for Deno and browser-like runtimes,
  including minimal `fs`, `process`, and `path` shims.
- `tests/binary.test.ts`: integration coverage for native binary download/cache behavior, direct
  cached executable execution, CLI forwarding, cache reuse without network access, and WASM
  transform/build execution.
- Native binary installation now verifies downloaded release assets against `SHA256SUMS` before
  caching them.
- Native binary cache writes now use a temporary file plus rename to avoid leaving partially-written
  executables behind on failed downloads or writes.
- Additional release-asset mappings for `aarch64-pc-windows-msvc` and `aarch64-unknown-freebsd`.

### Changed

- Bundled esbuild binary/API target updated from `0.28.0` to `0.28.1`.
- Native binary installation now downloads flat release assets from this repository's GitHub
  releases instead of downloading and extracting platform-specific `@esbuild/*` npm tarballs.
- Cached native binary filenames now use the release asset name directly, for example
  `esbuild-linux-x64@0.28.1`.
- WASM service startup now uses `shared/worker.ts` as a module worker instead of generating an
  inline blob from embedded worker source.
- `shared/worker.ts` now exports `createWorkerMessageHandler()` so the WASM API can share the same
  worker bridge for both Worker-backed and `worker: false` execution paths.

### Fixed

- WASM worker startup now reports initialization errors as `Error` instances and validates
  stdout/stdin message types before forwarding them to the esbuild service.
- Main-thread WASM execution now clears scheduled Go runtime timeouts on termination.
- Native binary downloads now fail fast with clearer HTTP and checksum errors.

### Removed

- npm tarball extraction helpers from `mod.ts`, including the gzip/tar extraction path used by the
  old `installFromNPM()` flow.
- `NPM_CONFIG_REGISTRY` support for native binary installation; binaries now come from this
  repository's GitHub release assets.

## [0.2.7] - 2026-06-12

### Changed

- `mod.ts` simplified back to using `installFromNPM` (downloads the platform-specific
  `@esbuild/<slug>` tarball from npm on first use; cache respects `XDG_CACHE_HOME` on Linux,
  `~/Library/Caches` on macOS, and `LOCALAPPDATA`/`USERPROFILE` on Windows). `ESBUILD_BINARY_PATH`
  override is still honoured.
- `shared/worker.ts` and `wasm.ts` simplified accordingly; `wasm_exec.js` is no longer loaded.
- `shared/common.ts`: `ESBUILD_VERSION = "0.28.0"` (hardcoded constant, not read from manifest).
- `deno.json` drops its `publish.exclude` negations; the JSR package no longer ships `bin/`,
  `manifest.json`, or `THIRD_PARTY_NOTICES.md`.

### Removed

- `tests/` entirely: the manifest, native binary, public API, sync shims, version match, and WASM
  tests added in the prior cycle were removed before release as part of the build-pipeline redesign.
- `.gitignore`: no longer needed since `bin/` lives at the repo root.

## [0.2.6] - 2026-06-12

### Changed

- `deno.json` adds `publish.exclude` negations to un-ignore the build artifacts (`bin/`,
  `manifest.json`, `THIRD_PARTY_NOTICES.md`, `wasm_exec.js`) for `deno publish` only. `deno fmt`,
  `deno lint`, and `deno test` are unaffected.

## [0.2.5] - 2026-05-05

### Added

- JSDoc module system and cross-link improvements across `mod.ts`, `wasm.ts`, `shared/common.ts`,
  `shared/stdio_protocol.ts`, `shared/types.ts`, `shared/uint8array_json_parser.ts`, and
  `shared/worker.ts`:
  - `@module` declarations on all shared modules.
  - `@see` cross-links between modules (mod↔wasm, mod↔shared/_, wasm↔shared/_).
  - `@param` and `@returns` annotations on all exported functions in `mod.ts` and `wasm.ts`.
  - `@throws` annotations on sync-API shims that throw unconditionally.
  - Module-level documentation explaining protocol encoding, the JSON parser's design, worker bridge
    behavior, and service lifecycle.

## [0.2.4] - 2026-05-05

### Added

- JSDoc documentation on all exported functions in `mod.ts`.
- JSDoc documentation on module-level and all exported functions in `wasm.ts`.
- JSDoc documentation on `ESBUILD_VERSION`, `validateInitializeOptions`, `StreamIn`, `StreamOut`,
  `StreamFS`, `Refs`, `StreamService`, and `createChannel` in `shared/common.ts`.
- JSDoc documentation on all protocol interface types and helper functions in
  `shared/stdio_protocol.ts`.
- JSDoc documentation on `JSON_parse` in `shared/uint8array_json_parser.ts`.
- Named type re-exports with `/** @see ... */` JSDoc cross-links in `mod.ts` and `wasm.ts`.

## [0.2.3] - 2026-05-05

### Changed

- Synchronized version bump across all `@ggpwnkthx/*` packages in this workspace.

## [0.2.2] - 2026-05-05

### Added

- JSDoc module documentation for `mod.ts`.

## [0.2.1] - 2026-05-04

### Changed

- The package now exposes the full esbuild API (build, context, transform, formatMessages,
  analyzeMetafile, initialize, stop) and also exports `shared/common`, `shared/stdio_protocol`,
  `shared/types`, `shared/uint8array_json_parser`, `shared/worker`, and `wasm` sub-paths.

### Removed

- Root `mod.ts` no longer exists; import from this package directly.

## [0.2.0] - 2026-05-02

### Added

- `mod.ts` re-exports the official esbuild Deno code as the package entry point.
- `wasm.ts` provides a browser-compatible WASM entry point.
- `shared/common.ts`: typed Go-style protocol primitives and runtime helpers.
- `shared/stdio_protocol.ts`: typed stdio protocol encoding for the esbuild service.
- `shared/types.ts`: protocol and configuration types.
- `shared/uint8array_json_parser.ts`: streaming JSON parser for `Uint8Array` input.
- `shared/worker.ts`: worker bridge for the WASM entry point.

### Changed

- Complete rewrite replacing low-level IPC/channel/codec machinery with Deno-native plugins and
  framework middleware.

## [0.1.6-rc.0] - 2026-03-29

### Fixed

- `stop()` now properly waits for channel cleanup before returning, preventing resource leaks during
  tests.
- Added `waitForClose()` method on channel to ensure all pending callbacks are resolved before
  shutdown.
- Added timeout fallback with force kill to prevent `stop()` from hanging indefinitely.

## [0.1.5] - 2026-03-29

### Fixed

- `handleRequest` now runs synchronously and catches promise rejections from callbacks instead of
  awaiting them, preventing potential hangs when context methods' callbacks throw.
- Fixed 3 context method tests that awaited `ctx.dispose()` without injecting the dispose response
  packet, causing tests to hang.

## [0.1.4] - 2026-03-28

### Changed

- Broke up large test files into smaller, more maintainable files:
  - `channel.test.ts` (1392 lines) split into 5 files in `tests/utils/channel/`.
  - `validation.test.ts` (467 lines) split into 4 files in `tests/utils/validation/`.
  - `misc.test.ts` (408 lines) split into 4 files in `tests/utils/misc/`.
  - Removed placeholder `simple.test.ts`.
- Created shared `_helpers.ts` modules to reduce code duplication in channel tests.

## [0.1.3] - 2026-03-28

### Added

- New `./native` export exposing esbuild's native JavaScript API for direct access.

### Changed

- Improved `installFromNPM` with proper fetch error handling.
- Improved `extractFileFromTarGzip` decompression using Blob streams.
- Fixed test assertions to use `assertRejects` instead of deprecated patterns.
- Fixed watch/serve tests with proper async cleanup and null assertions.

## [0.1.2] - 2026-03-26

### Added

- Module documentation for `src/install.ts` and `src/utils/mod.ts`.
- JSDoc documentation for all exported symbols across the codebase.

## [0.1.0] - 2026-03-26

### Added

- Initial code.
- Feature parity with esbuild.
