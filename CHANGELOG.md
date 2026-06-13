# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.8]

### Added

- `esbuild/shared/go_wasm.ts`: typed Go WASM runtime shim adapted for Deno and
  browser-like runtimes, including minimal `fs`, `process`, and `path` shims.
- `esbuild/tests/binary.test.ts`: integration coverage for native binary
  download/cache behavior, direct cached executable execution, CLI forwarding,
  cache reuse without network access, and WASM transform/build execution.
- Native binary installation now verifies downloaded release assets against
  `SHA256SUMS` before caching them.
- Native binary cache writes now use a temporary file plus rename to avoid
  leaving partially-written executables behind on failed downloads or writes.
- Additional release-asset mappings for `aarch64-pc-windows-msvc` and
  `aarch64-unknown-freebsd`.

### Changed

- All packages bumped to `0.2.8`.
- Bundled esbuild binary/API target updated from `0.28.0` to `0.28.1`.
- Native binary installation now downloads flat release assets from this
  repository's GitHub releases instead of downloading and extracting
  platform-specific `@esbuild/*` npm tarballs.
- Cached native binary filenames now use the release asset name directly, for
  example `esbuild-linux-x64@0.28.1`.
- WASM service startup now uses `esbuild/shared/worker.ts` as a module worker
  instead of generating an inline blob from embedded worker source.
- `esbuild/shared/worker.ts` now exports `createWorkerMessageHandler()` so the
  WASM API can share the same worker bridge for both Worker-backed and
  `worker: false` execution paths.
- README documentation for the workspace and core package was substantially
  expanded with package layout, permissions, supported release assets, cache
  behavior, CLI usage, WASM usage, plugin options, wrapper options, and
  development notes.
- Script help and validation examples updated from esbuild `0.28.0` to `0.28.1`.
- Deno plugin HTTPS fixture updated to reference `deno.land/x/esbuild@v0.28.1`.

### Fixed

- WASM worker startup now reports initialization errors as `Error` instances and
  validates stdout/stdin message types before forwarding them to the esbuild
  service.
- Main-thread WASM execution now clears scheduled Go runtime timeouts on
  termination.
- Native binary downloads now fail fast with clearer HTTP and checksum errors.

### Removed

- npm tarball extraction helpers from `esbuild/mod.ts`, including the gzip/tar
  extraction path used by the old `installFromNPM()` flow.
- `NPM_CONFIG_REGISTRY` support for native binary installation; binaries now
  come from this repository's GitHub release assets.

## [0.2.7]

### Added

- `scripts/`: new Go-based build pipeline for esbuild binaries (10 files:
  `assets.ts`, `build.ts`, `cli.ts`, `constants.ts`, `errors.ts`, `git.ts`,
  `main.ts`, `makefile.ts`, `process.ts`, `types.ts`). Clones
  `https://github.com/evanw/esbuild.git`, checks out the requested (or latest)
  `vX.Y.Z` tag, and runs
  `go build -trimpath -ldflags="-s -w -buildid="
  -buildvcs=false` per platform
  (CGO disabled). It parses the esbuild Makefile to enumerate every `platform-*`
  target, picking `GOOS`/`GOARCH`/`BINPATH`, always including the browser WASM
  (`js/wasm` → `esbuild-browser.wasm`) unless `--no-wasm`. Output is written to
  `./bin`: per-platform executable, `esbuild-browser.wasm`, `manifest.json`
  (version, source tag/commit, SHA-256, size per artifact), `SHA256SUMS`,
  `THIRD_PARTY_NOTICES.md`, and `RELEASE_NOTES.md`. SHA-256 computed via
  `crypto.subtle.digest`. Native binaries get `chmod 0o755`. The script refuses
  to write into a path that contains the esbuild checkout. Invoked via
  `deno task bin:build
  [--version X.Y.Z] [--platforms ...] [--no-wasm] [--clean]`.
- `.github/workflows/release-binaries.yml`: GitHub Actions workflow for
  releasing binaries. Runs on `workflow_dispatch` or push of a `vX.Y.Z` tag,
  resolves the version, runs
  `deno task bin:build --clean --out-dir ./dist
  --version <v>`, and uses
  `gh release create` to attach every `./dist/esbuild-*` plus
  `manifest.json`/`SHA256SUMS`/`THIRD_PARTY_NOTICES.md` to the release, with
  release notes drawn from `RELEASE_NOTES.md`.
- `plugins/css/mod.ts`: new `bundleCss` resolver that walks `@import` chains,
  deduplicates cycles, and emits a single bundled CSS output via
  `onResolve`/`onLoad` + `resolve`/`load` helpers.
- Go toolchain now available in the devcontainer.

### Changed

- `bin/` is now at the repo root and is gitignored; it is never shipped in the
  JSR package. `esbuild/deno.json` no longer carries `publish.exclude`
  negations.
- `esbuild/mod.ts` simplified back to using `installFromNPM` (downloads the
  platform-specific `@esbuild/<slug>` tarball from npm on first use; cache
  respects `XDG_CACHE_HOME` on Linux, `~/Library/Caches` on macOS, and
  `LOCALAPPDATA`/`USERPROFILE` on Windows). `ESBUILD_BINARY_PATH` override still
  honoured. `shared/worker.ts` and `esbuild/wasm.ts` simplified accordingly.
- `shared/common.ts`: `ESBUILD_VERSION = "0.28.0"` (hardcoded constant, not read
  from manifest).
- CI restructured: `.github/workflows/ci.yml` removed;
  `.github/workflows/publish.yml` now runs fmt/lint/check/test per package and
  publishes in dependency order (esbuild → shared → others).
- All packages bumped to `0.2.7`; `plugins/css` is published at `0.2.7` for the
  CSS bundling feature.

### Fixed

- Cross-package `jsr:` import version typo in `wrappers/hono/deno.json` and
  `wrappers/oak/deno.json` (`^0.2.5` → `^0.2.6`).
- `publish.exclude` issue on `esbuild` that could have excluded build artifacts.
- Publish order: esbuild package now publishes before shared and wrapper
  packages.

### Removed

- `esbuild/tests/` entirely: the test suite added in this release cycle
  (manifest, native binary, public API, sync shims, version match, and WASM
  tests) was removed before release as part of the build-pipeline redesign;
  coverage of those behaviours is deferred.
- `esbuild/.gitignore`: no longer needed since `bin/` lives at the repo root.

## [0.2.6]

### Fixed

- Publish workflow now runs `deno task build` before `deno publish` so the
  gitignored build artifacts (`bin/`, `manifest.json`, `THIRD_PARTY_NOTICES.md`,
  `wasm_exec.js`) are regenerated and shipped in the published JSR package.
- Added `publish.exclude` negations in `esbuild/deno.json` to un-ignore the
  build artifacts for `deno publish`.

### Changed

- `plugins/css` is published at `0.2.7`; it had an additional release cycle for
  the CSS plugin bundling feature added in commit `3cd82c2`. All other packages
  are published at `0.2.6`.

## [0.2.5]

### Added

- JSDoc module system and cross-link improvements across `esbuild/mod.ts`,
  `esbuild/wasm.ts`, `esbuild/shared/common.ts`,
  `esbuild/shared/stdio_protocol.ts`, `esbuild/shared/types.ts`,
  `esbuild/shared/uint8array_json_parser.ts`, and `esbuild/shared/worker.ts`:
  - Added `@module` declarations to all shared modules
  - Added `@see` cross-links between modules (mod↔wasm, mod↔shared/_,
    wasm↔shared/_)
  - Added `@param` and `@returns` annotations to all exported functions in
    mod.ts and wasm.ts
  - Added `@throws` annotations to sync-API shims that throw unconditionally
  - Added module-level documentation explaining protocol encoding, the JSON
    parser's design, worker bridge behavior, and service lifecycle

### Changed

- CI workflow: Removed test step from the `wrappers/shared` CI job (commented
  out)
- All packages bumped to version 0.2.5

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
