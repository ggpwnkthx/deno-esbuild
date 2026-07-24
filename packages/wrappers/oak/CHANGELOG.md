# Changelog

All notable changes to `@ggpwnkthx/esbuild-wrapper-oak` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.10] - 2026-07-24

### Changed

- Last synchronized version bump across all `@ggpwnkthx/*` packages in this workspace. Future
  versions of this package will be released independently.
- `mod.ts`: the wrapper no longer relies on the module-level `responseCache` and standalone
  `getCachedOrTranspile` export from `@ggpwnkthx/esbuild-wrapper-shared`. It now constructs a
  per-instance `Transpiler` via `createTranspiler()` at setup time and calls
  `transpiler.getCachedOrTranspile()` per request, so the cache is bound to the middleware instance
  instead of being shared across every call site.
- `mod.ts`: the wrapper now reads `ctx.response.body` after `next()` (string, `Uint8Array`, or
  `ReadableStream`) instead of `ctx.request.body`, matching the Hono wrapper's downstream-handler
  contract. This is a breaking behavior change for any downstream handler that previously relied on
  the Oak wrapper fetching the request body.
- `mod.ts`: a small `EsbuildLike` interface was added so tests can inject a stand-in without
  satisfying the full esbuild module shape.
- `tests/default.test.ts` and `tests/wasm.test.ts`: updated to construct a per-instance `Transpiler`
  and to assert the new `ctx.response.body` downstream-handler contract.

## [0.2.9] - 2026-07-24

### Changed

- Synchronized version bump across all `@ggpwnkthx/*` packages in this workspace.
- Repo-wide `deno fmt` style sweep (`singleQuote`, no `semiColons`, `lineWidth` 100) applied across
  `mod.ts`, `tests/`, and `transpilers/wasm.ts`.
- Strict `compilerOptions` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`) adopted in this package's `deno.json`.

## [0.2.8] - 2026-06-13

### Changed

- Synchronized version bump across all `@ggpwnkthx/*` packages in this workspace.

## [0.2.7] - 2026-06-12

### Changed

- Synchronized version bump across all `@ggpwnkthx/*` packages in this workspace.

## [0.2.6] - 2026-06-12

### Changed

- Synchronized version bump across all `@ggpwnkthx/*` packages in this workspace.

## [0.2.5] - 2026-05-05

### Changed

- Synchronized version bump across all `@ggpwnkthx/*` packages in this workspace.

## [0.2.4] - 2026-05-05

### Changed

- Synchronized version bump across all `@ggpwnkthx/*` packages in this workspace.
- `transpilers/wasm.ts`: aligned with the WASM transpiler contract used by the Hono wrapper.

## [0.2.3] - 2026-05-05

### Changed

- Synchronized version bump across all `@ggpwnkthx/*` packages in this workspace.
- `mod.ts` and `tests/default.test.ts`: aligned with the shared transpiler test that was added in
  this cycle.

## [0.2.2] - 2026-05-05

### Added

- JSDoc module-level documentation for `mod.ts`.
- Rewrote `README.md` to describe the package's API and usage.

### Changed

- Synchronized version bump across all `@ggpwnkthx/*` packages in this workspace.

## [0.2.1] - 2026-05-04

### Added

- Added `LICENSE.md`.

### Changed

- Synchronized version bump across all `@ggpwnkthx/*` packages in this workspace.

## [0.2.0] - 2026-05-04

### Added

- Initial release of `@ggpwnkthx/esbuild-wrapper-oak` as part of the monorepo split.
- `mod.ts`: Oak middleware that on-the-fly transpiles TypeScript / JSX via esbuild and serves the
  result as a downstream handler.
- `transpilers/wasm.ts`: a WASM-based variant of the middleware for environments where the native
  binary is not available.
- Initial test coverage in `tests/default.test.ts` and `tests/wasm.test.ts`.
