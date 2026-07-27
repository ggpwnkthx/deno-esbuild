# Changelog

All notable changes to `@ggpwnkthx/esbuild-plugin-deno` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.11] - 2026-07-26

### Preface

- v0.3.0 was a poorly executed idea that should have had far more testing than it received and was
  yanked.

### Added

- `createDenoPlugin()` returns a long-lived `DenoPluginHandle` that wraps the shared Deno
  `Workspace`
  - `Loader` plus the esbuild plugin. The handle exposes `resolve(spec, importer?)` (returns
    `{ url, absPath }`) and `build(entry, opts?)` (runs
    `esbuild.build({ bundle: true, write: false })` with the Deno plugin wired in and returns the
    bundled output as text). Call `handle[Symbol.dispose]()` when done — the handle owns loader
    lifetime so a dev server can hold one across many requests. New types: `ResolvedModule`,
    `ModuleBuildOptions`, `DenoPluginHandle`.

### Removed

- `unbundle()`, `unbundleInMemory()`, and the `UnbundleOptions` / `UnbundleInMemoryOptions` /
  `UnbundleResult` / `UnbundleInMemoryResult` types have been removed. The package now exposes only
  the esbuild `denoPlugin()` integration; multi-file Deno-style emit is out of scope. Use
  `esbuild.build({ bundle: true })` for bundling.
- `packages/plugins/deno/{unbundle,graph,path,rewrite,assets}.ts` and
  `packages/plugins/deno/tests/unbundle.test.ts` deleted.
- `packages/plugins/deno/deno.json`: removed `@deno/graph` from `imports` and dropped the deleted
  files from `publish.include`.

### Added

- `unbundleInMemory()` returns the same transpiled, import-rewritten ESM tree that `unbundle()`
  would have written to disk, keyed by output-relative path in a `Map<string, Uint8Array>`. Useful
  for runtime transpile flows (e.g. `deno serve` dev servers) that don't want to mediate a temporary
  directory.
- `unbundle()` / `unbundleInMemory()` accept `outbase` to strip a project-root prefix from local
  file paths, and `platform` (`'browser'` | `'node'` | `'neutral'`) for package export conditions.

### Changed

- `unbundle()` / `unbundleInMemory()` convert CommonJS modules (raw CJS plus loader-detected CJS
  inside an ESM facade) through per-module esbuild bundles with co-located `__commonJS` runtimes.
  ESM importers that request named CJS properties are rewritten to import a local default shim and
  destructure it locally, eliminating browser-side `require()` / `module.exports`. Per-module CJS
  conversion is intentionally more expensive and may duplicate dependency code in exchange for
  browser-executable ESM.
- `path.ts`: rewrote as a scheme-dispatch table (`npm:`, `jsr:`, `file://`, `http(s)://`) with
  separate mappers. Recognises Deno's global `npm/registry.npmjs.org/<name>/<version>/` cache layout
  in addition to `node_modules/.deno/<name>@<ver>/...`, normalises `outbase` against
  `path.resolve()` so the emitted tree is stable across platforms, and uses POSIX separators for the
  resulting relative paths.
- `utils.ts`: `mediaToLoader` and `getPlatform` are now table-driven maps. Added `hasUrlScheme()`
  and `schemeToNamespace()` to centralise scheme classification shared with the plugin resolver.
- `mod.ts`: extracted `publicEnvVarPrefix` inlining to `env.ts`, the importer-substitution logic to
  `resolve.ts`, and `WorkspaceOptions` construction plus the shared `CommonOptions` interface to
  `workspace.ts`. `DenoPluginOptions` and `UnbundleOptions` now `extends CommonOptions`, so the same
  `configPath` / `platform` / `noTranspile` / `preserveJsx` / `debug` fields appear on both.
- `deno.json` (this package): added `env.ts`, `resolve.ts`, and `workspace.ts` to `publish.include`.
- `tests/utils.test.ts`: added coverage for `hasUrlScheme` and `schemeToNamespace`.
- `tests/resolve.test.ts`: new file covering `resolveImporter` (no workspace root, synthetic
  referrer, remote URLs, in-workspace, out-of-workspace, managed package locations, bare absolute
  path importer).
- `tests/unbundle.test.ts`: added tests for `outbase` re-rooting, `npm:react` CJS subpath emitting
  with `__commonJS`, an ESM importer of a CJS module referencing a local shim, `platform: 'browser'`
  resolving the browser condition, and the new `unbundleInMemory()` API (entry + outbase).
- `README.md`: documented `outbase`, `platform`, and the CJS→ESM shim behavior, and refreshed the
  `unbundle()` options table.

## [0.3.0] - 2026-07-25

### Added

- New `unbundle()` export for emitting every dependency as a separate ESM file under a target
  directory. Given Deno-style entrypoints (`npm:react`, `jsr:@hono/hono@4.12.32/jsx/dom`, import-map
  bare specifiers, file paths, etc.), the function walks the full module graph, transpiles each
  module to ESM via `@deno/loader` + esbuild, and writes one file per module with imports rewritten
  to local relative paths. Useful for serving Deno-style code from a CDN, debugging dependency
  trees, or feeding the emitted tree to a dev server that wants per-file control.
  - `graph.ts`: walks the Deno-style module graph using `@deno/graph` for dependency edges and
    `@deno/loader` for resolution + transpilation. Resolves relative entrypoints to file URLs,
    primes `@deno/loader` via `addEntrypoints`, and returns a `Map<url, UnbundledModule>`.
  - `path.ts`: maps resolved URLs to deterministic output paths mirroring the original namespace
    (`npm__react@18.3.1/index.js`, `jsr__@hono__hono@4.12.32/src/jsx/dom/index.js`,
    `https__example.com/mod.js`, etc.). Recognises Deno's `node_modules/.deno/<name>@<ver>/...` npm
    cache layout and the `https://jsr.io/<scope>/<name>/<version>/<sub>` JSR registry layout.
  - `rewrite.ts`: handles the per-file pipeline — optional `publicEnvVarPrefix` substitution,
    specifier text rewriting (`from "<spec>"` and `import("<spec>")`) against the emitted path map,
    then `esbuild.transform` with `format: 'esm'` for CJS/TS/JSX transpilation.
  - `assets.ts`: classifies media types into JS transpiled, binary passthrough (CSS, HTML, SQL,
    JSON, source maps, wasm), and computed paths that preserve the original extension.
  - `unbundle.ts`: top-level driver. Builds the `Workspace`, walks the graph, computes the path map,
    transpiles each module, writes files under `outdir`, and returns `{ files, entryFiles }`.
  - `UnbundleOptions`: `entryPoints`, `outdir`, `configPath`, `noTranspile`, `jsx` (`'transform'` |
    `'preserve'`), `jsxImportSource`, `jsxFactory`, `jsxFragment`, `publicEnvVarPrefix`, `target`,
    `debug`.
  - `UnbundleResult`: `files` (absolute paths of every emitted file) and `entryFiles` (subset
    corresponding to `entryPoints` in the same order).
- `tests/unbundle.test.ts`: 8 new tests covering `npm:react` end-to-end (entry + subpath sibling
  files), `jsr:@hono/hono@4.12.32/jsx/dom` with `jsx: 'preserve'` and `jsx: 'transform'` modes, a
  `deno.json` import-map rewrite from a bare specifier to a local relative path, `npm:ms@2.1.3`
  CJS→ESM conversion, `publicEnvVarPrefix` inlining of `Deno.env.get('PUBLIC_TEST_VAR')`, and
  re-rooted relative imports (`./util.ts` → `./util.js`).

### Changed

- `mod.ts`: re-exports `unbundle`, `UnbundleOptions`, and `UnbundleResult` from `./unbundle.ts`.
- `deno.json` (this package): added `jsr:@deno/graph@^0.110.2` to `imports`; added `graph.ts`,
  `path.ts`, `rewrite.ts`, `assets.ts`, and `unbundle.ts` to `publish.include`.
- `README.md`: new "Unbundled output" section showing the `unbundle()` API, a sample output tree,
  and a table of supported options.

## [0.2.10] - 2026-07-24

### Added

- JSDoc documentation on the `DenoPluginOptions` interface in `mod.ts`.

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
