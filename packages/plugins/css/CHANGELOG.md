# Changelog

All notable changes to `@ggpwnkthx/esbuild-plugin-css` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- JSDoc documentation on the `CssPluginOptions` interface in `mod.ts`.

## [0.2.10] - 2026-07-24

### Changed

- Last synchronized version bump across all `@ggpwnkthx/*` packages in this workspace. Future
  versions of this package will be released independently.
- `mod.ts`: the `onLoad` filter was refactored to use a single, more permissive namespace predicate
  so the CSS plugin's loader is matched against the importer's emitted path rather than the
  importer's URL; this keeps the CSS import path consistent across the build and tree-shaking
  passes.
- `tests/mod.test.ts`: indexed-access results now use `result.outputFiles[0]?.text ?? ''` to satisfy
  `noUncheckedIndexedAccess` and produce a stable empty-string fallback when no output files are
  produced.

## [0.2.9] - 2026-07-24

### Changed

- Synchronized version bump across all `@ggpwnkthx/*` packages in this workspace.
- Repo-wide `deno fmt` style sweep (`singleQuote`, no `semiColons`, `lineWidth` 100) applied across
  `mod.ts` and `tests/mod.test.ts`.
- Strict `compilerOptions` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`) adopted in this package's `deno.json`.

## [0.2.8] - 2026-06-13

### Changed

- Synchronized version bump across all `@ggpwnkthx/*` packages in this workspace.

## [0.2.7] - 2026-06-12

### Changed

- Synchronized version bump across all `@ggpwnkthx/*` packages in this workspace.

## [0.2.6] - 2026-06-12

### Added

- CSS plugin bundling support: implemented the `CssPlugin` in `mod.ts` so esbuild can resolve and
  emit CSS imports for single-file and multi-file builds.
- Initial test coverage in `tests/mod.test.ts` for the build and transform flows.

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

- Initial release of `@ggpwnkthx/esbuild-plugin-css` as part of the monorepo split.
- `mod.ts`: the CSS plugin implementation, satisfying the directory-package layout established by
  the monorepo conversion.
