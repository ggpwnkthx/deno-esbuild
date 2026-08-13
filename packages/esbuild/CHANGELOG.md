# Changelog

All notable changes to `@ggpwnkthx/esbuild` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.16] - 2026-08-13

### Added

- `ESBUILD_CACHE_DIR` environment variable: overrides the cache directory used by the native binary
  installer. Highest priority; takes precedence over `DENO_DIR` and platform defaults. Lets callers
  collapse the four-env-var permission footprint down to a single `--allow-env=ESBUILD_CACHE_DIR`.
- `getDenoCacheBase()` helper exported from `@ggpwnkthx/esbuild/shared/cache_root` (also re-exported
  via the `@ggpwnkthx/esbuild/shared` barrel). Resolves the parent of Deno's managed cache root the
  same way the `deno` CLI does for `deno info` output.

### Changed

- Native binary installer now resolves its cache directory through `DENO_DIR` when set, falling back
  to the platform default. The path-joining logic was factored into `shared/cache_root.ts` so the
  algorithm is in one place and uses `@std/path` instead of manual string concatenation. Existing
  cache locations are preserved for users who do not set `DENO_DIR`.

### Dependencies

- Added `@std/path` (`jsr:@std/path@^1.0.0`).

## [0.2.15] - 2026-07-28

### Changed

- Modularised the previously-monolithic `shared/` files into folder modules so the package can grow
  without making every collaborator read every line. The `deno.json` `exports` map now points each
  shared subpath at the new entry point:
  - `shared/flags` → `shared/flags/mod.ts` (split into `build.ts`, `defaults.ts`, `mod.ts`,
    `normalize.ts`, `push_helpers.ts`, `transform.ts`, `types.ts`).
  - `shared/plugin_runner` → `shared/plugin_runner/mod.ts` (split into `handle_plugins.ts`,
    `lifecycle.ts`, `messages.ts`, `mod.ts`, `object_stash.ts`, `on_load.ts`, `on_resolve.ts`,
    `on_start.ts`, `plugin_setup.ts`, `request_callbacks.ts`, `types.ts`).
  - `shared/transport` → `shared/transport/mod.ts` (split into `build_context.ts`,
    `build_context_lifecycle.ts`, `build_context_rebuild.ts`, `build_response.ts`, `channel.ts`,
    `mod.ts`, `service.ts`, `simple_services.ts`, `sync_stubs.ts`, `transform.ts`, `types.ts`,
    `util.ts`, `version.ts`).
  - `shared/stdio_protocol` → `shared/stdio_protocol/mod.ts` (split into `formatter_messages.ts`,
    `le.ts`, `messages.ts`, `mod.ts`, `packet.ts`, `plugin_messages.ts`, `utf8.ts`).
  - `shared/types` → `shared/types/mod.ts` (split into `api.ts`, `build.ts`, `common.ts`,
    `diagnostics.ts`, `metafile.ts`, `mod.ts`, `plugin.ts`, `plugin_callbacks.ts`, `primitives.ts`,
    `serve.ts`, `transform.ts`, `tsconfig.ts`).
  - `shared/worker` → `shared/worker/mod.ts` (split into `entry.ts`, `mod.ts`, `runtime.ts`,
    `types.ts`).
- Extracted two shared helpers out of `shared/validation.ts` into their own modules to keep the
  validator surface focused:
  - `validateStringValue` and `validateAndJoinStringArray` → `shared/string_helpers.ts`.
  - `jsRegExpToGoRegExp` → `shared/regex.ts`.
  - `shared/validation.ts` re-exports the moved names so existing test imports
    (`tests/validation.test.ts`, `tests/message_sanitize.test.ts`) keep resolving.
- Extracted `failureErrorWithLog` out of `shared/message_sanitize.ts` into a standalone
  `shared/failure_error.ts`. `shared/message_sanitize.ts` carries a back-compat re-export so the
  existing test import (`tests/message_sanitize.test.ts`) keeps working.
- `shared/mod.ts` barrel now re-exports from the folder modules. The added `stdio_protocol/` subpath
  in the `exports` map lets consumers reach the packet/formatter helpers directly.
- `shared/types/mod.ts` carries the consolidated `TsconfigRaw`, `BuildOptions`, `TransformOptions`,
  and `Plugin` types the package exports; the old single-file `shared/types.ts` is gone.

### Fixed

- `shared/stdio_protocol.test.ts` and `shared/message_sanitize.test.ts` now import their helpers
  from the new locations (`./shared/stdio_protocol/mod.ts` and `./shared/failure_error.ts`
  respectively) so the test suite keeps running against the same symbols that ship to consumers.

## [0.2.14] - 2026-07-25

### Changed

- Stable cut of `0.2.14-rc.0`. Identical content to `0.2.14-rc.0` and `0.2.13`; the rc prerelease
  confirmed that the reverted `deno publish` path produces a Sigstore Rekor entry (see root
  `CHANGELOG.md`, "fix(ci): debug JSR OIDC provenance under deno publish + cut 0.2.14-rc.0"). No
  behavioral changes versus `0.2.13`.

## [0.2.14-rc.0] - 2026-07-25

### Changed

- `deno.json`: version bumped to `0.2.14-rc.0`. Identical content to `0.2.13`; the rc prerelease is
  a diagnostic build used to verify that the publish workflow produces a Sigstore Rekor entry under
  the reverted `deno publish` path (see root `CHANGELOG.md`, "fix(ci): debug JSR OIDC provenance
  under deno publish + cut 0.2.14-rc.0"). Once the diagnostic run produces a non-null `rekorLogId`
  for `0.2.14-rc.0`, a follow-up release will cut `0.2.14` for stable adoption.

## [0.2.13] - 2026-07-25

### Added

- Comprehensive protocol-level test suite (97 new tests, all passing) covering:
  - `tests/validation.test.ts`: every `mustBe*` validator, `getFlag`, `checkForInvalidFlags`,
    `validateInitializeOptions` for both `native` and `wasm` runtimes, `validateMangleCache`,
    `validateStringValue`, and `validateAndJoinStringArray`.
  - `tests/stdio_protocol.test.ts`: `encodePacket`/`decodePacket` round-trips for every `Value`
    variant, the id-word encoding, the 4-byte length prefix, malformed/truncated packet handling,
    UTF-8 in both directions, and a 1 MiB payload round-trip.
  - `tests/message_sanitize.test.ts`: location trimming (the esbuild#3467 "huge minified file"
    path), `detail` stash round-tripping, `failureErrorWithLog` summary formatting (singular/plural,
    5-entry ellipsis truncation, lazy getters).
  - `tests/build.test.ts`: end-to-end builds through the native transport covering stdin TS input,
    `write: false`, metafile, minify, the `cjs` / `iife` / `esm` formats, `bundle: false`,
    build-promise rejection on unresolved entry points and unknown option keys, and the
    `build → build → stop` reuse path.
  - `tests/transform.test.ts`: TS stripping, minify, `esm`/`cjs` formats, `Uint8Array` input, JSX
    loader, target rewriting, invalid input shape, and sourcemap JSON validity.
  - `tests/plugin.test.ts`: virtual-module injection (`onResolve` + `onLoad` + custom namespace),
    path rerouting, `pluginData` round-tripping from `onResolve` to `onLoad`, `initialOptions`
    exposure, plugin-returned `errors` and throwing callbacks, plugin name validation,
    `build.resolve()` from inside a plugin, and `onDispose` after a `context.dispose()`.

### Fixed

- `shared/plugin_runner.ts`: `onResolve` and `onLoad` handlers now accept `errors` and `warnings`
  keys on their return values. The strict `checkForInvalidFlags` whitelist at the start of each
  handler was excluding those keys, so every documented esbuild plugin that returned `errors: [...]`
  or `warnings: [...]` from a callback was rejected with "Invalid option from onResolve() callback"
  instead of surfacing the messages. The 0.2.11 fix had only removed the redundant call from
  `collectPluginMessages`; the inline whitelists in the two handlers were missed and have now been
  corrected. Plugin authors should now find the
  [`errors`/`warnings` return shape](https://esbuild.github.io/plugins/) works as documented.

### Changed

- `deno.json`: added an `imports` map entry for `@std/assert` so the new test suite can use the
  project's convention without `deno add`. No runtime impact.

## [0.2.12] - 2026-07-25

### Added

- JSDoc documentation on previously undocumented fields and helpers across the esbuild package:
  - `mod.ts`: doc comments on `defaultWD`, `nativeTransformFs`, `longLivedService`, `stopService`,
    `initializeWasCalled`, `ensureServiceIsRunning`, and `api`.
  - `wasm.ts`: doc comments on the internal `WorkerMessageEvent` / `WorkerLike` interfaces, the
    `initializePromise` / `stopService` / `hasInitialized` / `currentWasmOptions` state,
    `startRunningService`, `toError`, `ensureServiceIsRunning`, and `api`.
  - `shared/types.ts`: per-field JSDoc on `TsconfigRaw.compilerOptions`, `StdinOptions`, `Message`,
    `Note`, `Location`, `OutputFile`, `BuildResult`, `BuildFailure`, `ServeOptions`, `CORSOptions`,
    `ServeOnRequestArgs`, `ServeResult`, plus module-level docs on the internal `CommonOptions`
    supertype.
  - `shared/stdio_protocol.ts`: per-field JSDoc on every wire-protocol request/response interface
    (`BuildRequest`, `ServeRequest`, `ServeResponse`, `BuildPlugin`, `BuildResponse`,
    `OnEndRequest`, `OnEndResponse`, `BuildOutputFile`, `PingRequest`, `RebuildRequest`,
    `RebuildResponse`, `DisposeRequest`, `CancelRequest`, `WatchRequest`, `OnServeRequest`,
    `TransformRequest`, `TransformResponse`, etc.).
  - `shared/transport.ts`: per-field JSDoc on `StreamIn`, `StreamOut`, `StreamFS`, `Refs`,
    `StreamService`, `Service`, `ServiceEnv`, `SyncStubs`, plus module-level docs on `CloseData` and
    `MAX_PACKET_BYTES`.
  - `shared/plugin_runner.ts`: per-field JSDoc on `ObjectStash`, `PluginStreamIn`,
    `PluginMessageContext`, `HandlePluginsResult`, `HandlePluginsFailure`, and module-level docs on
    `createObjectStash`, `RequestCallback`, `RunOnEndCallbacks`.
  - `shared/message_sanitize.ts`: module-level docs on `ObjectStashLike`, `sanitizeLocation`,
    `sanitizeMessages`, `sanitizeStringArray`, `sanitizeStringMap`, and `replaceDetailsInMessages`.
  - `shared/flags.ts`: docs on `pushLogFlags`, `pushCommonFlags`, `buildLogLevelDefault`,
    `transformLogLevelDefault`, `BuildFlagsResult`, `flagsForBuildOptions`, `TransformFlagsResult`,
    `flagsForTransformOptions`, `buildLogLevelDefaultValue`, and `transformLogLevelDefaultValue`.
  - `shared/v8_stack.ts`: docs on `StreamInLike`, `ObjectStashLike`, and `parseStackLinesV8` (plus
    the inner `at` frame prefix).
  - `shared/validation.ts`: per-field docs on `OptionKeys`; module-level docs on `getFlag`,
    `checkForInvalidFlags`, every `mustBe*` validator, `RuntimeKind`, `validateInitializeOptions`,
    `MangleCache`, `CommonOptions`, `validateMangleCache`, `validateStringValue`, and
    `validateAndJoinStringArray`.
  - `shared/worker.ts`: docs on `WorkerOutputMessage`, `ErrnoCallback`, `GoWasmFS`,
    `GoWasmRuntimeHandle`, `GoWasmRuntimeConstructor`, `EsbuildWorkerGlobal`, and module-level docs
    on the worker bridge.
  - `binary_installer.ts`: docs on `RELEASE_BASE_URL`, `FetchKind`, `sha256Hex`, and
    `platformAssetRegistry`.

### Fixed

- `mod.ts` and `wasm.ts`: the exported `api` object is now annotated as `EsbuildApi` so consumers
  see the full typed public surface (`build`, `context`, `transform`, `formatMessages`,
  `analyzeMetafile`, `initialize`, `stop`) without having to import the type manually.

## [0.2.11] - 2026-07-24

### Added

- New `binary_installer.ts` module that isolates the native-binary download, SHA-256 verification,
  and platform-specific cache-path resolution. Its only public export is `install()`, which `mod.ts`
  consumes once for the long-lived service and once for the CLI passthrough.
- New `Service`, `ServiceEnv`, `createService`, `SyncStubs`, and `createSyncStubs` exports in
  `shared/common.ts`. Both transports now build the public API surface through `createService`, and
  the four sync stubs (`buildSync`, `transformSync`, `formatMessagesSync`, `analyzeMetafileSync`)
  are produced by a single `createSyncStubs()` factory.
- Unit tests in `tests/binary.test.ts` that assert each sync stub throws the expected
  unsupported-API error message for both the native and WASM transports.
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
- `shared/validation.ts`, `shared/flags.ts`, `shared/v8_stack.ts`, `shared/message_sanitize.ts`,
  `shared/plugin_runner.ts`, `shared/transport.ts`, `shared/spawn.ts`, and
  `shared/create_esbuild_api.ts` extracted from the former `shared/common.ts`. The `shared/common`
  subpath export is replaced by the barrel `shared/index.ts`; the new sibling subpaths
  (`shared/validation`, `shared/flags`, etc.) are additive.
- `shared/spawn.ts` exports `SpawnHandle`, `SpawnOptions`, `SpawnFn`, `validateSpawnOptions`, and
  `spawnWithDenoCommand`. The native transport (`mod.ts`) now imports them instead of defining its
  own copies.
- `shared/create_esbuild_api.ts` exports `createEsbuildApi`, the factory used by `mod.ts` and
  `wasm.ts` to wire the lazy-init service, sync stubs, and stop function into the public API
  surface.
- `binary_installer.ts`: `registerPlatform(name, assetName)` and `unregisterPlatform(name)` allow
  embedders to add custom platform-to-asset mappings. `knownPlatforms()` returns the list of
  currently registered keys.

### Changed

- `shared/common.ts` was split into seven focused files (see Added). The public surface is
  unchanged; existing consumers that imported `shared/common` should switch to `shared` (the new
  barrel).
- `validateInitializeOptions` now accepts a runtime discriminator (`'native' | 'wasm'`). The native
  transport rejects `wasmURL`, `wasmModule`, and `worker`; the WASM transport requires either
  `wasmURL` or `wasmModule`. Both transports previously had the rules inline; the centralization
  removes the duplication.
- `handlePlugins` now goes through `collectPluginMessages` and `exceptionToMessage` helpers for the
  four `sanitizeMessages` / `extractErrorMessageV8` call sites (`onStart`, `onEnd`, `onResolve`,
  `onLoad`). Behavior is identical; the change makes the contract easier to reason about and keeps
  the warning/error shapes consistent.
- `mod.ts` now spawns the binary through `spawnWithDenoCommand` from `shared/spawn.ts` instead of
  declaring its own `spawn` helper.
- `mod.ts` and `wasm.ts` now expose the public API through `createEsbuildApi` instead of each
  re-defining the five async exports and four sync stubs.
- `binary_installer.ts`: the platform-asset map is now a `Map<string, string>` (see
  `registerPlatform` / `unregisterPlatform`) instead of a frozen
  `Record<string, { assetName: string }>`.
- `createChannel` `readFromStdout` now caps the protocol buffer at 64 MiB (`MAX_PACKET_BYTES`)
  instead of allowing unbounded growth. A peer that declares an oversized packet length will fail
  with a descriptive error rather than OOMing the host. The first-packet version check is now
  documented with a JSDoc block.
- `mod.ts` was split. Binary download, cache-path resolution, the platform-asset map, SHA-256
  verification, and the `fetchChecked` HTTP helper now live in `binary_installer.ts`. The `SpawnFn`
  abstraction was retained and `spawnNew` was renamed to `spawn` (the redundant
  `const spawn = spawnNew` alias was removed) so the process handle can be swapped for a test double
  in the future.
- `mod.ts` and `wasm.ts` now obtain their public API via `common.createService(...)` instead of
  reimplementing the `build` / `context` / `transform` / `formatMessages` / `analyzeMetafile`
  Promise wrappers in each entry. The `nativeTransformFs` callbacks stay in `mod.ts`; the WASM
  transport uses the new shared `defaultTransformFs` in-place stub.
- `mod.ts` and `wasm.ts` import the `Service` interface from `shared/common.ts` instead of declaring
  it locally.
- `deno.json` `publish.include` now lists `binary_installer.ts` so the new module ships with the
  package.

### Fixed

- `plugin_runner.ts` `collectPluginMessages` no longer calls `checkForInvalidFlags` on the plugin
  callback result. The inline callers (`onResolve`, `onLoad`, `onStart`, `onEnd`) already validate
  the full set of allowed properties before extracting `errors` and `warnings`. The helper's
  redundant validation was rejecting standard plugin return values like `path`, `namespace`,
  `contents`, `loader`, and `resolveDir`, breaking every plugin (including the in-repo `css` and
  `deno` plugins).

### Security

- `MAX_PACKET_BYTES` cap on the stdio protocol buffer prevents a malicious or misbehaving peer from
  triggering unbounded memory allocation.

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
