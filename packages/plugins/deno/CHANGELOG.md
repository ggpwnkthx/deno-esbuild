# Changelog

All notable changes to `@ggpwnkthx/esbuild-plugin-deno` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- JSDoc documentation on the `DenoPluginOptions` interface in `mod.ts`.

## [0.2.10] - 2026-07-24

### Changed

- Last synchronized version bump across all `@ggpwnkthx/*` packages in this workspace. Future
  versions of this package will be released independently.
- `mod.ts`: example JSDoc reference updated from `@deno/esbuild` to `@ggpwnkthx/esbuild-plugin-deno`
  to point users at the current package name.
- `tests/mod.test.ts`: added an additional ingest integration case (the `loader` and `resolveDirs`
  are now asserted together) so the round-trip through the esbuild service walks through the new
  caching path.
- `tests/utils.test.ts`: the `packageConfig` parser no longer asserts the legacy `package.json`
  fallback when no `deno.json` is present; the behavior was renamed to `loadPackageConfig` and the
  test sections covering the old path were removed.

## [0.2.9] - 2026-07-24

### Fixed

- `mod.ts`: `onLoad` now returns `resolveDir` set to the loaded file's directory so esbuild can
  resolve relative imports emitted by its CJS-to-ESM conversion pass when the plugin's `Resolve`
  hook declines to handle an importer outside the plugin workspace root.
- `mod.ts`: `onResolve` no longer swaps in a workspace-anchored synthetic referrer for importers
  under a managed package path (a path segment equal to `node_modules` or `deno`); pass-through lets
  `loader.resolve` compute relative imports against the importer's real directory, fixing
  `require('./sibling')` from npm cache paths.

### Changed

- Synchronized version bump across all `@ggpwnkthx/*` packages in this workspace.
- Repo-wide `deno fmt` style sweep (`singleQuote`, no `semiColons`, `lineWidth` 100) applied across
  `mod.ts`, `utils.ts`, and `tests/`.
- Strict `compilerOptions` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`) adopted in this package's `deno.json`.

## [0.2.8] - 2026-06-13

### Changed

- Synchronized version bump across all `@ggpwnkthx/*` packages in this workspace.
- `tests/mod.test.ts`: the integration tests now use the new binary-installation path (download
  verified binaries from the GitHub release) instead of the old npm-tarball flow.

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

- Initial release of `@ggpwnkthx/esbuild-plugin-deno` as part of the monorepo split.
- `mod.ts`: the Deno plugin implementation (resolver + loader for `npm:` and `jsr:` specifiers via
  `@deno/loader`).
- `utils.ts`: shared helpers for resolving package configuration and emitting diagnostics.
- Initial test coverage in `tests/mod.test.ts` and `tests/utils.test.ts`.
