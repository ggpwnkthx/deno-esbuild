# Changelog

This changelog documents changes to the workspace itself: root configuration, CI/CD, GitHub
workflows, dev environment, repo-wide tooling, scripts, and release coordination. Changes to
individual packages live in each package's own `CHANGELOG.md`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## latest - 2026-07-24

### docs: document every exported symbol and enforce with CI guard

- Added `/** ... */` blocks to all 35 previously undocumented exports across the workspace:
  - `packages/esbuild/shared/types.ts` (33 symbols, including the type aliases `Platform`, `Format`,
    `Loader`, `LogLevel`, `Charset`, `Drop`, `AbsPaths`, `ImportKind`, the interfaces `TsconfigRaw`,
    `BuildOptions`, `StdinOptions`, `Message`, `Note`, `Location`, `OutputFile`, `BuildResult`,
    `BuildFailure`, `ServeOnRequestArgs`, `TransformOptions`, `TransformResult`, `TransformFailure`,
    `Plugin`, `PluginBuild`, `OnStartResult`, `OnEndResult`, `PartialMessage`, `PartialNote`,
    `BuildContext`, `InitializeOptions`, and the module-level declarations `version` and `stop`).
    The 16-line `//` comment above `stop()` was converted verbatim into a `/** */` block.
  - `packages/esbuild/shared/worker.ts` (`WorkerInputMessage`, `GoWasmRuntimeHandle`).
  - `packages/plugins/css/mod.ts` (`CssPluginOptions`).
  - `packages/plugins/deno/mod.ts` (`DenoPluginOptions`).
- Added `scripts/check_exports_documented.ts`: a CI guard that walks each workspace package's
  `exports` map, runs `deno doc --json` on every entrypoint, and fails the run if any exported
  declaration is missing a `jsDoc.doc` field.
- Root `deno.json`: added a `doc:check` task that invokes the guard, and appended it to the `ci`
  task so `deno task ci` now also enforces JSDoc coverage on every export going forward.

## fd1fd23 - 2026-07-24

### chore(wrappers): allow net to github.com and jsr.io for hono/oak tests

- `packages/wrappers/hono/deno.json` and `packages/wrappers/oak/deno.json`: appended
  `--allow-net=github.com,jsr.io` to the `test` and `ci` tasks so the wrapper test suites can fetch
  transitive dependencies from `github.com` and `jsr.io`.
- `.github/workflows/ci.yml`: mirrored the same scoped `--allow-net=github.com,jsr.io` permission on
  the `packages/wrappers/hono` and `packages/wrappers/oak` matrix entries so local and CI runs stay
  aligned.

## 8eb9a51 - 2026-07-24

### chore(ci): publish via workflow_run and split by dependency order

- `.github/workflows/publish.yml` now triggers on `workflow_run` (CI success) instead of
  `push: tags: v*.*.*`, so packages are only published when CI is green. The trigger still accepts
  `workflow_dispatch` for manual single-package releases.
- Split the single `publish` job into three ordered jobs that publish in JSR dependency order:
  `publish-base` (`packages/esbuild`), `publish-deps` (`packages/wrappers/shared`,
  `packages/plugins/deno`, `packages/plugins/css`), and `publish-wrappers`
  (`packages/wrappers/hono`, `packages/wrappers/oak`). Each stage is gated by `needs:` on the
  previous job.
- Extracted the per-package publish steps into a new composite action at
  `.github/actions/publish-package/action.yml` that checks out the CI head SHA when triggered by
  `workflow_run` (or the branch when triggered by `workflow_dispatch`), sets up Deno, restores the
  dependency cache, honors the `package` input filter, and runs `deno publish`.
- `.github/workflows/ci.yml`: bumped `actions/cache` from `@v4` to `@v5`, and hoisted `DENO_VERSION`
  from step-level to job-level `env` so the `setup-deno` step and the `deno` invocation share the
  same value.
- `.github/workflows/ci.yml`: added `--allow-run` to the `test` matrix entries for `plugins/deno`,
  `plugins/css`, `wrappers/hono`, and `wrappers/oak` (these packages spawn esbuild subprocesses in
  their tests).
- `packages/wrappers/shared/deno.json`: added `@std/assert` to `imports`.
- `packages/wrappers/shared/tests/mod.test.ts`: new unit tests covering `shouldTranspile` (default
  and custom extensions), the `DEFAULT_EXTENSIONS` / `DEFAULT_CONTENT_TYPE` constants, and
  `createTranspiler` cache behavior (mocks `EsbuildLike` to verify `cache: true` reuses prior
  transforms, the default `cache: false` re-runs, and `clearCache()` empties stored entries).
- `deno.lock`: pinned `jsr:@ggpwnkthx/esbuild-wrapper-shared` from `@1` to `@~0.2.10` in the
  `packages/wrappers/hono` and `packages/wrappers/oak` workspace entries to match the actual
  published version.

## 0b1e8ee - 2026-07-24

### refactor(wrappers): isolate transpiler state per middleware instance

- Added `.github/workflows/ci.yml`: a package-matrix CI workflow that runs `fmt`, `lint`, `check`,
  and `test` per workspace member on every push and pull request against `main`.
- Simplified `.github/workflows/publish.yml` (114 → 25 lines): publishing no longer re-runs the full
  CI matrix now that `.github/workflows/ci.yml` owns those checks.
- Root `deno.json`: added `nodeModulesDir: "none"`, a workspace `compilerOptions` block carrying
  `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noImplicitOverride`, and
  a top-level `ci` task that runs `deno fmt --check && deno lint && deno check`.
- Root `deno.json` exclude pattern now matches dot-prefixed paths correctly (`./*` → `./.*`); the
  previous pattern did not actually exclude hidden files from `fmt`/`lint`/`check` discovery.
- Per-package `deno.json` files: each member now declares its own `publish.include` list (instead of
  relying on the workspace defaults) and a `ci` task; `compilerOptions` moved to the root so the
  strict settings stay in one place.
- Reframed this root `CHANGELOG.md` to track only workspace-level changes (CI, workflows, root
  config, tooling, scripts, release coordination). Every package now keeps its own `CHANGELOG.md`
  for package-level changes (`packages/esbuild/CHANGELOG.md`, `packages/plugins/css/CHANGELOG.md`,
  `packages/plugins/deno/CHANGELOG.md`, `packages/wrappers/hono/CHANGELOG.md`,
  `packages/wrappers/oak/CHANGELOG.md`, `packages/wrappers/shared/CHANGELOG.md`).
- Bumped `@ggpwnkthx/esbuild` to `0.2.10` (release coordination; per-package delta in
  `packages/esbuild/CHANGELOG.md`).
- The shared transpiler library no longer exposes a module-level response cache or a standalone
  `getCachedOrTranspile` export; wrappers now build a per-instance `Transpiler` via
  `createTranspiler()`. Per-package API changes in `packages/wrappers/shared/CHANGELOG.md`; Hono and
  Oak wrapper call sites updated in `packages/wrappers/hono/CHANGELOG.md` and
  `packages/wrappers/oak/CHANGELOG.md`.
- The Oak wrapper now reads `ctx.response.body` after `next()` (string, `Uint8Array`, or
  `ReadableStream`) instead of `ctx.request.body`, matching the Hono wrapper's downstream-handler
  contract. Per-package change in `packages/wrappers/oak/CHANGELOG.md`.
- Hardened `scripts/makefile.ts` parser for `noUncheckedIndexedAccess` (non-null assertions on regex
  captures, defensive `?? ''` fallbacks).
- Extended `.gitignore` with `.deno`, `coverage`, `dist`, `node_modules`, `*.tmp`, and `*.partial`
  so generated build, test, and dependency directories stay out of source control.

## bc6dff5 - 2026-07-24

### chore: restructure into packages/ workspace and fix setup issues

- Consolidated publishable packages under `packages/` so `esbuild/`, `plugins/`, and `wrappers/`
  live in a single tree.
- Updated root `deno.json` workspace entries to point at `packages/...`; regenerated `deno.lock`
  with members keyed under `packages/...`.
- Updated `.github/workflows/publish.yml` working-directory and matrix package paths to match the
  new layout.
- Updated README layout diagram and packages table paths.
- Added missing `fmt`/`lint`/`check`/`test` tasks to `packages/wrappers/shared/deno.json`.
- Fixed root `deno.json` exclude pattern (`"./*"` → `"./.*"`) so dot-prefixed paths are actually
  excluded from `fmt`/`lint`/`check` discovery.
- Dropped stale `deno-lock.json` entry from `.gitignore` (the actual lockfile is `deno.lock`).
- Removed duplicate `*.sh text eol=lf` line from `.gitattributes`.

## 8ba14a8 - 2026-07-24

### chore: new dev environment

- Removed `.devcontainer/` configuration.
- Removed `.opencode/` configuration.
- Updated all dependencies to latest versions.

## 5d89f09 - 2026-07-24

### chore: release 0.2.9

- Bumped all packages to `0.2.9` (release coordination; per-package details in each `CHANGELOG.md`).
- Adopted a repo-wide `deno fmt` style (`singleQuote`, no `semiColons`, `lineWidth` 100) and ran it
  across the workspace.
- Added strict `compilerOptions` (`strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`) to each package's `deno.json`.
- Root `deno.json`: dropped stale `file:` workspace aliases; added `fmt` and `lint` blocks.
- Rewrapped `README.md`, `CONTRIBUTING.md`, `LICENSE.md`, `SECURITY.md`, and
  `CONVENTIONAL_COMMITS.md` to the new line width.
- Bumped per-package JSR version references to `0.2.9`.

## 24b7738 - 2026-06-13

### chore: update change log

- Refreshed `CHANGELOG.md` with the `0.2.8` release notes.

## 81ff15e - 2026-06-12

### fix(ci): release task

- Corrected `.github/workflows/release-binaries.yml` task invocation.

## 25f7a7f - 2026-06-12

### fix(ci): lock file

- Removed stale entries from `deno.lock`.

## 9feb668 - 2026-06-12

### fix: ci

- Adjusted `.github/workflows/publish.yml` triggers and conditions.

## bc5f0f9 - 2026-06-12

### fix: ci

- Removed a leftover step from `.github/workflows/publish.yml`.

## 8ac2e4d - 2026-06-12

### chore: release 0.2.7

- Bumped all packages to `0.2.7`; `plugins/css` is published at `0.2.7` for the CSS bundling feature
  (release coordination).
- Added `.github/workflows/release-binaries.yml`: runs on `workflow_dispatch` or push of a `vX.Y.Z`
  tag, resolves the version, runs `deno task bin:build --clean --out-dir ./dist
  --version <v>`,
  and uses `gh release create` to attach every `./dist/esbuild-*` plus
  `manifest.json`/`SHA256SUMS`/`THIRD_PARTY_NOTICES.md` to the release.
- Added the root Go-based build pipeline under `scripts/` (`assets.ts`, `build.ts`, `cli.ts`,
  `constants.ts`, `errors.ts`, `git.ts`, `main.ts`, `makefile.ts`, `process.ts`, `types.ts`). Clones
  `https://github.com/evanw/esbuild.git`, checks out the requested (or latest) `vX.Y.Z` tag, and
  runs `go build -trimpath -ldflags="-s -w -buildid=" -buildvcs=false` per platform (CGO disabled).
  Parses the esbuild Makefile to enumerate every `platform-*` target, picking
  `GOOS`/`GOARCH`/`BINPATH`, always including the browser WASM (`js/wasm` → `esbuild-browser.wasm`)
  unless `--no-wasm`. Output is written to `./bin`: per-platform executable, `esbuild-browser.wasm`,
  `manifest.json`, `SHA256SUMS`, `THIRD_PARTY_NOTICES.md`, and `RELEASE_NOTES.md`. SHA-256 computed
  via `crypto.subtle.digest`. Native binaries get `chmod 0o755`. The script refuses to write into a
  path that contains the esbuild checkout. Invoked via
  `deno task bin:build [--version X.Y.Z] [--platforms ...] [--no-wasm] [--clean]`.
- Made Go toolchain available in the devcontainer.
- `bin/` is now at the repo root and gitignored; it is never shipped in the JSR package.
- Removed the now-redundant `esbuild/.gitignore`.
- Restructured CI: `.github/workflows/ci.yml` removed; `.github/workflows/publish.yml` now runs
  `fmt`/`lint`/`check`/`test` per package and publishes in dependency order (esbuild → shared →
  others).
- Publish order: esbuild package now publishes before shared and wrapper packages.
- Refreshed `README.md` and `CHANGELOG.md` to describe the new release pipeline.

## a7f4b48 - 2026-06-12

### fix(ci): publish order

- Reordered `.github/workflows/publish.yml` so esbuild publishes before shared and wrappers.

## 6e48dd1 - 2026-06-12

### chore: version bump

- Bumped package versions and trimmed `deno.lock` for the `0.2.6` cycle.

## 3bca647 - 2026-06-12

### fix(ci): merge ci and publish

- Removed `.github/workflows/ci.yml`.
- Folded CI steps into `.github/workflows/publish.yml` so `fmt`/`lint`/`check`/`test` run on every
  push/PR alongside publishing.

## 66e4fc0 - 2026-06-12

### fix(ci): must build to get manifest

- `.github/workflows/ci.yml` now builds binaries before manifest checks so `manifest.json` exists
  for downstream steps.

## fdb38a3 - 2026-06-12

### chore: fmt

- Ran `deno fmt` across `esbuild/mod.ts` and `scripts/build/main.ts` to match repo style.

## b36ebee - 2026-06-12

### ci: agent models

- Wired new `.opencode` agent model configurations.

## 4351c3c - 2026-06-12

### fix(ci): rebuild esbuild binaries in publish workflow

- `.github/workflows/publish.yml` (`publish-esbuild` job) now runs `deno task build --clean` before
  `deno publish`, with `actions/setup-go@v5` pinned to `1.26.4`, so the gitignored build artifacts
  (`bin/`, `manifest.json`, `THIRD_PARTY_NOTICES.md`, `wasm_exec.js`) are regenerated and shipped in
  the published JSR package.
- Documented that `plugins/css` ships at `0.2.7` in the `0.2.6` CHANGELOG entry; it had an extra
  release cycle for the CSS plugin bundling feature added in commit `3cd82c2`. The other five
  packages are at `0.2.6`.

## 3137c46 - 2026-06-12

### feat: esbuild binary build script

- Added the root `scripts/` Go-based build pipeline (initial commit of `scripts/build/` modules:
  `main.ts`, `cli.ts`, `build.ts`, `makefile.ts`, `packaging.ts`, `git.ts`, `process.ts`,
  `errors.ts`, `types.ts`, `constants.ts`).
- Root `deno.json` gained the `bin:build` task and pinned JSR imports for `@std/cli`,
  `@std/encoding`, `@std/path`, `@std/semver`; `deno.lock` updated accordingly.
- Added `.gitignore` entries so build artifacts stay out of source control.

## fdd1eb6 - 2026-06-11

### ci: skill update

- Added and refreshed `.opencode/` skills and agents for the new deno release workflow.

## 7aa31c8 - 2026-06-11

### ci: add golang

- Made the Go toolchain available in the devcontainer so the `scripts/` pipeline can run locally.

## 8743696 - 2026-05-05

### docs: release 0.2.5

- Bumped all packages to `0.2.5` (release coordination).
- Commented out the test step in the `wrappers/shared` CI job.

## 133dbcd - 2026-05-05

### fix: remove ci test

- Removed a flaky CI test step.

## d7a1495 - 2026-05-05

### fix: test permissions

- `.github/workflows/ci.yml`: replaced blanket `--allow-all` test permissions with the minimum each
  package needs.

## 0faa307 - 2026-05-05

### chore: release 0.2.4

- Bumped all packages to `0.2.4` (release coordination).
- Restructured CI from a matrix job into three sequential jobs (esbuild → plugins → wrappers) with
  explicit dependency ordering in `.github/workflows/ci.yml`.
- Pinned the Deno version used in CI to `2.7.14` (was `2.7.7`).
- Added a root `deno.json` `imports` block carrying `@std/semver` for the new release tooling.

## a6c3853 - 2026-05-05

### chore: vbump

- Bumped per-package versions and refreshed `CHANGELOG.md` for the `0.2.3` cycle.

## 314d71a - 2026-05-05

### fix: ci/cd

- Removed `.github/scripts/update-esbuild.ts` (auto-updater was causing issues and is no longer
  needed).
- Adjusted `.github/workflows/ci.yml` and `.github/workflows/publish.yml` to drop the auto-update
  step.
- Switched GitHub Actions to `denoland/setup-deno@v2` and `actions/checkout@v4`.

## 1d416ad - 2026-05-05

### fix: fmt

- Reformatted `.opencode/` TypeScript and Markdown files to the repo style.
- Refreshed `CHANGELOG.md` for the `0.2.2` cycle.

## aca661e - 2026-05-05

### docs: add JSDoc module docs, rewrite README, bump to 0.2.2

- Rewrote root `README.md` with a monorepo overview table, package-by-package examples, shared
  exports table, and environment variables section.
- Bumped all packages to `0.2.2`; cross-package `jsr:` import versions updated to
  `jsr:@ggpwnkthx/esbuild@0.2.2` (release coordination).
- Refreshed `CONTRIBUTING.md` to match the monorepo layout.

## 20c272d - 2026-05-05

### fix: version

- Fixed version string drift across the five per-package `deno.json` files.

## 8d6c53e - 2026-05-05

### fix: publishing

- Adjusted `.github/workflows/publish.yml` so `plugins/css` ships at `0.2.7` (release coordination;
  per-package changes in `plugins/css/CHANGELOG.md`).

## b23ebef - 2026-05-05

### fix: publishing

- Adjusted `.github/workflows/publish.yml` so `esbuild` ships first in the publish graph (release
  coordination; per-package changes in `packages/esbuild/CHANGELOG.md`).

## 6c79f91 - 2026-05-04

### fix: version

- Corrected a stale version string across the five per-package `deno.json` files.

## 03700bc - 2026-05-04

### add licenses

- Added `LICENSE.md` to every package: `esbuild`, `plugins/css`, `plugins/deno`, `wrappers/hono`,
  `wrappers/oak`, `wrappers/shared`.

## ff67051 - 2026-05-04

### feat: convert to monorepo with separate package directories

- Converted the single-package layout into a multi-package structure with individual `deno.json`
  files per package: `esbuild/`, `plugins/css/`, `plugins/deno/`, `wrappers/hono/`, `wrappers/oak/`,
  `wrappers/shared/`.
- Published shared utilities as `@ggpwnkthx/esbuild-wrapper-shared` (release coordination).
- Applied formatting across all TypeScript files to the new style.
- Removed the old `deno.jsonc`, `deno.lock`, root `mod.ts`, and `wrappers/shared.ts`.
- Updated `.github/workflows/publish.yml` to publish the new package set.
- Refreshed `CONTRIBUTING.md` and `README.md` to describe the monorepo layout.

## aca1cd8 - 2026-05-04

### fix: imports

- Reorganized the plugin and wrapper layout into per-package directories with their own `mod.ts` and
  `tests/`. `plugins/css.ts` → `plugins/css/mod.ts`, `plugins/deno.ts` → `plugins/deno/mod.ts`,
  `wrappers/shared.ts` → `wrappers/shared/mod.ts`.
- Removed the standalone `plugins/html.ts`; HTML plugin was not adopted by any package.
- Consolidated `wrappers/tests/utils.test.ts` into `plugins/deno/tests/utils.test.ts` ahead of the
  monorepo split.

## 817353d - 2026-05-02

### refactor: restructure as middleware and plugins

- Restructured the project as middleware + plugins: dropped the old `src/` and `tests/` layout
  (`api.ts`, `install.ts`, `mod.ts`, `native.ts`, `types.ts`, `src/utils/`, `src/plugins/`,
  `tests/`, `tests/utils/`).
- Added `plugins/deno.ts`, `plugins/css.ts`, `plugins/html.ts`, `plugins/utils.ts`, with
  corresponding tests.
- Added `wrappers/shared.ts` (in-memory LRU response cache with TTL) plus per-framework
  `wrappers/hono/`, `wrappers/oak/` modules and WASM transpiler variants.
- Switched `deno.jsonc` to JSR-managed dependencies: `@deno/loader`, `jsr:@hono/hono`,
  `jsr:@oak/oak`.
- Updated root `mod.ts` to a thin passthrough re-exporting from `plugins/`.
- Removed `.vscode/` overrides, `.opencode/` agent config, and `examples/`; aligned root
  documentation files.

## 9f97b5d - 2026-03-26

### v bump

- Bumped the workspace version file for the `0.1.2` cycle (release coordination).

## 0e04830 - 2026-03-26

### publish release

- Bumped the workspace version file to publish the first JSR release.

## 1c9b73f - 2026-03-25

### Add GitHub Actions workflow for publishing

- Added `.github/workflows/publish.yml` for JSR publishing on tag push.
