# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.4]

### Changed

- Broke up large test files into smaller, more maintainable files:
  - `channel.test.ts` (1392 lines) split into 5 files in `tests/utils/channel/`
  - `validation.test.ts` (467 lines) split into 4 files in `tests/utils/validation/`
  - `misc.test.ts` (408 lines) split into 4 files in `tests/utils/misc/`
  - Removed placeholder `simple.test.ts`
- Created shared `_helpers.ts` modules to reduce code duplication in channel tests.

## [0.1.3]

### Added

- New `./native` export exposing esbuild's native JavaScript API for direct access.

### Changed

- Improved `installFromNPM` with proper fetch error handling.
- Improved `extractFileFromTarGzip` decompression using Blob streams.
- Fixed test assertions to use `assertRejects` instead of deprecated patterns.
- Fixed watch/serve tests with proper async cleanup and null assertions.

## [0.1.2]

### Added

- Module documentation for all entrypoints (`src/install.ts`, `src/utils/mod.ts`).
- JSDoc documentation for all exported symbols across the codebase.

## [0.1.1]

### Added

- JSR publishing workflow.

## [0.1.0]

### Added

- Initial code.
- Feature parity with esbuild.
