# Changelog

All notable changes to `@ggpwnkthx/esbuild-wrapper-hono` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.12] - 2026-07-27

### Added

- `Options.postProcess` (`(code: string) => string | Promise<string>`) is now wired through
  `createTranspiler` and `transpiler.getCachedOrTranspile`, so consumers can run an AST rewriter
  (e.g. `@ggpwnkthx/esbuild-wrapper-shared`'s `rewriteImports`) after every esbuild transform
  without wrapping their own `EsbuildLike`. The constructor-time default plus a per-call override
  are both supported; per-call wins when both are supplied.

### Changed

- Sibling pin `jsr:@ggpwnkthx/esbuild-wrapper-shared@^0.3.1` bumped to
  `jsr:@ggpwnkthx/esbuild-wrapper-shared@^0.3.3` so the wrapper consumes the upstream
  `rewriteImports` fixes (`isBareSpec` scoped-specifier match in 0.3.2 and `.js`-suffix specifier
  normalisation in 0.3.3) plus the transpiler-wide `postProcess` default added in 0.3.3.

## [0.2.11] - 2026-07-27

### Changed

- Sibling pin `jsr:@ggpwnkthx/esbuild-wrapper-shared@^0.2.10` bumped to
  `jsr:@ggpwnkthx/esbuild-wrapper-shared@^0.3.1` so the wrapper consumes the new shared release
  (additive `Router`/`Route`/`rewriteImports`/`mimeFor` exports plus the `TranspileRequest.version`
  and `TranspileRequest.postProcess` cache hooks). No code change in this wrapper — the pin moves
  the dependency surface forward so consumers get the new shared utilities through the wrapper
  package.

## [0.2.10] - 2026-07-24

### Changed

- Last synchronized version bump across all `@ggpwnkthx/*` packages in this workspace. Future
  versions of this package will be released independently.
- `mod.ts`: the wrapper no longer relies on the module-level `responseCache` and standalone
  `getCachedOrTranspile` export from `@ggpwnkthx/esbuild-wrapper-shared`. It now constructs a
  per-instance `Transpiler` via `createTranspiler()` at setup time and calls
  `transpiler.getCachedOrTranspile()` per request, so the cache is bound to the middleware instance
  instead of being shared across every call site.
- `mod.ts`: example JSDoc reference updated to `@ggpwnkthx/esbuild-wrapper-hono`.
- `tests/default.test.ts`: adjusted to the new transpiler API; `Transpiler` is now constructed per
  test and assertions target `transpiler.clearCache()` and `transpiler.getCachedOrTranspile()`
  rather than the removed module-level helpers.

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

- Initial release of `@ggpwnkthx/esbuild-wrapper-hono` as part of the monorepo split.
- `mod.ts`: Hono middleware that on-the-fly transpiles TypeScript / JSX via esbuild and serves the
  result as a downstream handler.
- `transpilers/wasm.ts`: a WASM-based variant of the middleware for environments where the native
  binary is not available.
- Initial test coverage in `tests/default.test.ts` and `tests/wasm.test.ts`.
