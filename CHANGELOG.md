# Changelog

This changelog documents changes to the workspace itself: root configuration, CI/CD, GitHub
workflows, dev environment, repo-wide tooling, scripts, and release coordination. Changes to
individual packages live in each package's own `CHANGELOG.md`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## latest - 2026-07-28

### chore(esbuild): cut 0.2.15

- `@ggpwnkthx/esbuild` (`packages/esbuild/`) bumped from `0.2.14` to `0.2.15`. Internal refactor
  only — the public API surface is unchanged. The previously-monolithic `shared/` files were split
  into folder modules so the package can grow without making every collaborator read every line:
  - `shared/flags` → `shared/flags/{build,defaults,mod,normalize,push_helpers,transform,types}.ts`.
  - `shared/plugin_runner` →
    `shared/plugin_runner/{handle_plugins,lifecycle,messages,mod,object_stash,on_load,on_resolve,on_start,plugin_setup,request_callbacks,types}.ts`.
  - `shared/transport` →
    `shared/transport/{build_context,build_context_lifecycle,build_context_rebuild,build_response,channel,mod,service,simple_services,sync_stubs,transform,types,util,version}.ts`.
  - `shared/stdio_protocol` →
    `shared/stdio_protocol/{formatter_messages,le,messages,mod,packet,plugin_messages,utf8}.ts`.
  - `shared/types` →
    `shared/types/{api,build,common,diagnostics,metafile,mod,plugin,plugin_callbacks,primitives,serve,transform,tsconfig}.ts`.
  - `shared/worker` → `shared/worker/{entry,mod,runtime,types}.ts`.
- Three helpers were extracted out of `shared/validation.ts` so the validator surface stays focused:
  - `validateStringValue` and `validateAndJoinStringArray` → `shared/string_helpers.ts`.
  - `jsRegExpToGoRegExp` → `shared/regex.ts`.
  - `shared/validation.ts` re-exports the moved names so existing test imports
    (`tests/validation.test.ts`, `tests/message_sanitize.test.ts`) keep resolving.
- `failureErrorWithLog` is now its own `shared/failure_error.ts` module;
  `shared/message_sanitize.ts` carries a back-compat re-export so the existing test import keeps
  working.
- `deno.json` `exports` map: `./shared/flags`, `./shared/plugin_runner`, `./shared/transport`,
  `./shared/stdio_protocol`, `./shared/types`, and `./shared/worker` now point at the folder
  `mod.ts` entry points. A new `./shared/stdio_protocol` subpath exposes the packet/formatter
  helpers directly. No user-visible change in the API.

### fix(esbuild-plugin-commonjs): cut 0.1.1

- `@ggpwnkthx/esbuild-plugin-commonjs` (`packages/plugins/commonjs/`) bumped from `0.1.0` to
  `0.1.1`. The earlier `0.1.0` baseline was rolled back in `8392dc2` and re-cut here with the new
  `exports.X = Y` rewrite and the `extractCjsExports` / `onDynamicExport` surface:
  - `extractCjsExports(source, options?)` — pure scan that returns the statically-resolvable
    `exports.X = Y` names from a CJS source string (with a `dynamic` flag for unrecognised shapes).
    Walks into `if/else`, `try/catch/finally`, `for/while/do`, `with`, and other block-shaped
    statements so names declared in `process.env`-gated branches are still found. Re-exported from
    the package's `.` subpath so consumers can invoke it directly without reaching into
    `./transform.ts`.
  - `TransformOptions.onDynamicExport` and `CommonjsPluginOptions.onDynamicExport` — optional
    callback for unrecognised export shapes (computed keys, `Object.assign(exports, ...)`,
    `module.exports = function/class/expr`). Lets callers surface a one-shot warning to the operator
    when a CJS file uses a shape the transform can't statically forward.
  - The `CommonjsPluginOptions` is now re-exported via the package's `.` subpath along with the
    `TransformOptions`, `TransformResult`, and `CjsExportsScan` types.
- Fixed: `exports.X = Y` assignments at module top scope are now rewritten to
  `const X = Y; export { X };` instead of being left in place (which would have thrown
  `ReferenceError: exports is not defined` at runtime once esbuild's `__commonJS` wrapper stripped
  the `module` / `exports` bindings). Names declared via top-level `function X() {}` / `var X = …`
  are surfaced without a redundant `const X = …;` to avoid duplicate declarations; the rewrite skips
  emitting `const X = Y;` when `X` is already bound at module top scope. Last-write-wins on
  duplicate `exports.X = …` assignments (matching the runtime `module.exports` shape). Unrecognised
  shapes trigger `onDynamicExport` rather than silently dropping the rewrite.
- `tests/mod.test.ts`: new `plugin — surfaces`exports.X = Y`named exports through bundling`
  integration test (with backing `tests/fixtures/cjs-named-exports.js`) asserts the end-to-end
  bundle no longer carries the `exports.X = …` assignment that used to throw at runtime.
- `tests/transform.test.ts`: new regression cases for `exports.X = Y` reuses an existing top-level
  binding, the trailing `export { … }` aggregation, and the `onDynamicExport` callback for
  unrecognised shapes.

### refactor(example): consume extractCjsExports in serve_module

- `examples/component-library/CHANGELOG.md` already documented the move to
  `extractCjsExports`-driven destructure shims under `[Unreleased]`. The follow-up release of
  `@ggpwnkthx/esbuild-plugin-commonjs@0.1.1` makes that surface public (the example previously
  re-implemented the walker locally). No version bump for the example — it is unversioned.

## previous - 2026-07-27

### fix(esbuild-wrapper-shared): scoped-specifier + .js-suffix fixes; cut 0.3.2 and 0.3.3

- `@ggpwnkthx/esbuild-wrapper-shared` (`packages/wrappers/shared/`) bumped from `0.3.1` to `0.3.3`.
  Three upstream fixes that the Hono/Oak wrappers and `examples/component-library` need to load
  npm-bundled output without leaving bare specifiers unre-written:
  - `rewriteImports` `isBareSpec` regex now matches scoped package specifiers (e.g. `@mui/material`,
    `@emotion/react`) in addition to unprefixed bare specifiers. The previous `^[A-Za-z]` regex
    silently left scoped bare specifiers unrewritten, which caused the browser to throw
    `TypeError: Failed to resolve module specifier "@mui/material"` at runtime.
  - `rewriteImports` now normalises the `specifier` to a `.js`-suffixed form before `parseModule`
    via the new `jsLikeSpecifier()` helper. The previous code only forced the `.js` extension when
    the input ended in `.tsx`/`.ts`; for any other spec (e.g. `react`, `@mui/material`) the parser
    returned zero-width AST spans for most imports, which silently dropped them from the rewrite
    pass and triggered `TypeError: Failed to resolve module specifier "react"` at runtime.
  - `TranspilerOptions.postProcess` and `Options.postProcess` are new optional
    `(code: string) => string | Promise<string>` hooks that let consumers register an AST rewriter
    at `createTranspiler` construction time. A per-call `TranspileRequest.postProcess` (when
    supplied) overrides the constructor-time default, so a Hono app can register `rewriteImports`
    once at middleware-construction time without wrapping the `EsbuildLike` per request.
- `packages/wrappers/shared/tests/`: new regression cases
  ("`normalises non-TS/JSX specifier to .js for parseModule`",
  "`normalises scoped npm specifier
  (no extension) to .js`",
  "`constructor postProcess default runs without per-call override`",
  "`per-call postProcess overrides the constructor default`") pin down the new behavior.

### feat(esbuild-wrapper-hono): wire Options.postProcess and cut 0.2.12

- `@ggpwnkthx/esbuild-wrapper-hono` (`packages/wrappers/hono/`) bumped from `0.2.11` to `0.2.12`.
  `Options.postProcess` is now wired through both `createTranspiler` (the constructor-time default)
  and `getCachedOrTranspile` (the per-call override). Per-call wins when both are supplied, matching
  the shared `postProcess ?? defaultPostProcess` semantics. A Hono app can register a single shared
  AST rewriter at middleware-construction time (e.g. `@ggpwnkthx/esbuild-wrapper-shared`'s
  `rewriteImports`) without wrapping the `EsbuildLike` per request.
- Sibling pin `jsr:@ggpwnkthx/esbuild-wrapper-shared@^0.3.1` bumped to
  `jsr:@ggpwnkthx/esbuild-wrapper-shared@^0.3.3` so the wrapper consumes the upstream
  `rewriteImports` fixes plus the transpiler-wide `postProcess` default.
- `packages/wrappers/hono/README.md`: new "Post-process the transpiled code" section demonstrates
  wiring `rewriteImports` into the middleware via the new option, and the options table gains a
  `postProcess` row.
- `packages/wrappers/hono/tests/default.test.ts`: new
  `postProcess runs after esbuild.transform on
  every response` case injects a mock `EsbuildLike`,
  registers a `postProcess` hook, and asserts the hook is called exactly once and its output is what
  the response body contains.

### chore(esbuild-wrapper-oak): cut 0.2.12 (sibling pin bump)

- `@ggpwnkthx/esbuild-wrapper-oak` (`packages/wrappers/oak/`) bumped from `0.2.11` to `0.2.12`.
  Sibling pin `jsr:@ggpwnkthx/esbuild-wrapper-shared@^0.3.1` bumped to
  `jsr:@ggpwnkthx/esbuild-wrapper-shared@^0.3.3` so the wrapper consumes the upstream
  `rewriteImports` fixes plus the transpiler-wide `postProcess` default. No code change in this
  wrapper — the pin moves the dependency surface forward so consumers get the new shared utilities
  through the wrapper package. The Oak wrapper does not yet surface `Options.postProcess`; the
  upstream `postProcess` is only reachable via the Hono wrapper's `Options` until Oak gains a
  parallel option in a future release.

### feat(esbuild-plugin-commonjs): initial release at 0.2.0

- New workspace member `packages/plugins/commonjs/` shipping `@ggpwnkthx/esbuild-plugin-commonjs` at
  version `0.2.0`. esbuild plugin that converts CommonJS source files to ESM at the `onLoad` step so
  they bundle cleanly into a browser-targeted ESM payload. The transform is a hand-rolled TypeScript
  AST walker in `transform.ts` built on `acorn` (parse) + `astring` (codegen) — no Babel runtime, no
  SWC binary. Recognised CJS shapes (top-level `require(spec)`, `var X = require(spec)`,
  `var { a, b } = require(spec)`, `module.exports = X`, `module.exports = { ... }`,
  `module.exports = require(mod)`) are rewritten to the equivalent ESM; anything outside the
  recognised set passes through unchanged. A fast text-based pre-pass (`looksLikeCjs`) keeps the
  no-op path cheap. `CommonjsPluginOptions`: `filter?: RegExp | RegExp[]` (limit the transform to a
  subset of files) and `sourcemap?: boolean`. The plugin short-circuits in `setup()` when
  `build.initialOptions.format !== "esm"`; esbuild's built-in CJS handling is the right thing for
  CJS / IIFE output.
- `deno.json` (root): `packages/plugins/commonjs` added to the `workspace` list; `scopes` block
  gains a `./packages/plugins/commonjs/` key redirecting `esbuild` to the local source for sibling
  development.
- `.github/workflows/publish.yml`: `packages/plugins/commonjs` added to the `ci` matrix and to the
  `publish-deps` matrix (it depends only on `@ggpwnkthx/esbuild`, so it can ship in `publish-deps`
  once `publish-base` has shipped `packages/esbuild`).
- `.gitignore`: `deno.lock` added at the root so the workspace's `"lock": false` setting is
  preserved across `deno install` runs.
- Test coverage: `tests/transform.test.ts` (16 cases for the AST walker), `tests/detect.test.ts` (6
  cases for `looksLikeCjs`), `tests/mod.test.ts` (5 integration cases via `esbuild.build`). All 27
  tests pass.

### refactor(example): swap examples/component-library for Material UI; tighten module allowlist

- `examples/component-library` migrated off the hand-rolled `src/Button.tsx` / `src/Card.tsx`
  library. `src/main.tsx` now renders `@mui/material`'s `Button` + `Card` + `CardContent` +
  `Typography` directly. `deno.json` imports `@mui/material@^9.2.0` (subpaths `Button`, `Card`,
  `CardContent`, `Typography`) plus the two MUI peer dependencies `@emotion/react@^11.14.0` and
  `@emotion/styled@^11.14.1`. The `react/jsx-runtime`, `react/jsx-dev-runtime`, and
  `react-dom/client` subpaths are added to the `imports` map (React stays at 18.3.1) so esbuild's
  automatic JSX transform output is rewriteable to `/@modules/<spec>` URLs alongside the rest. The
  `@ggpwnkthx/esbuild-wrapper-shared` pin moves from `^0.3.1` to `^0.3.3` to pick up the
  scoped-specifier fix in `isBareSpec` and the `.js`-suffix normaliser.
- The `publish` block in `examples/component-library/deno.json` is removed: with no `Button.tsx` /
  `Card.tsx` to ship, the example no longer publishes anything.
- `examples/component-library/deno.lock` is deleted. The workspace root's `deno.json` sets
  `"lock": false`, and Deno 2.x rejects `"lock"` overrides in workspace members, so the example's
  previous lockfile (which only tracked React and was already stale relative to the new MUI/Emotion
  tree) could no longer be regenerated in this state.
- `src/serve.ts` now derives the `/@modules/<spec>` allowlist from the `deno.json` imports map at
  module load. Only keys whose value starts with `npm:` are allowed; type packages (`@types/react`,
  `@types/react-dom`), dev tooling (`@astral/astral`, `@deno/graph`,
  `@ggpwnkthx/esbuild-wrapper-shared`, `@std/*`) share the `imports` map but resolve to a JSR URL
  the browser would not import, so they are filtered out to keep `/@modules/<spec>` from being a
  public CDN for the wrong audience. The same filtered set feeds both the route gate and the
  `rewriteImports` `postProcess` resolver.
- `src/server/allowlist.ts` is deleted (the allowlist is now derived in `serve.ts`).
  `src/server/serve_module.ts` is rewritten around two shim shapes: CJS-only specs with no static
  export list (`react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`,
  `react/jsx-dev-runtime`) feed a hand-maintained destructure into
  `import * as ns from "<abs>"; const { ... } = ns; export { ... }; export default ns;`. Every other
  npm spec (MUI, Emotion, anything that ships a real ESM module) feeds
  `export * from "<abs>"; export { default } from "<abs>";` into esbuild's CJS-to-ESM bridge.
  `react` is externalised for every non-React bundle via `reactExternalPlugin(spec)` so the browser
  fetches `/@modules/react` once and reuses the cached module for MUI and the per-route react
  bundles. The CJS-bridged bundles' inner `require("react")` calls are rewritten to a static
  `import * as __React0 from "/@modules/react"` reference by `neutralizeDynamicReactRequires(spec)`,
  so the CJS-bundled code reads from the shared module's namespace import.
- `tests/allowlist_test.ts` is deleted (the allowlist is no longer a separate file).
  `tests/browser_test.ts` is rewritten to assert on a fully-rendered MUI tree (the `MuiButton-root`
  and `MuiCard-root` class hooks, the `MuiTypography-h5` title, and the click counter updates from
  `Clicked 0 times` to `Clicked 2 times` after two clicks). The 90s timeout now rejects (and is
  cleared on completion) instead of silently resolving, so a hung test can no longer falsely pass.
- New `examples/component-library/CHANGELOG.md` documents the MUI migration. The example is
  unversioned (no JSR name/version in `deno.json`), so the CHANGELOG uses `[Unreleased]`.

## previous - 2026-07-27

### refactor(workspace): promote Router + import rewriter + MIME helpers into shared wrapper; ship examples/component-library

- `@ggpwnkthx/esbuild-wrapper-shared` (`packages/wrappers/shared/`) bumped from `0.2.10` to `0.3.1`
  — a patch release after the rolled-back `0.3.0`. New public exports so Hono and Oak consumers and
  the new examples workspace member share one source of truth:
  - `Router`, `Route`, `RouteContext`: a framework-agnostic ordered route dispatcher. Each `Route`
    is a `{ match, handle }` pair; `router.dispatch(req, ctx)` returns the first matching route's
    response or a 404. The `Route` shape is intentionally compatible with both Hono and Oak handlers
    so the same route list can dispatch into either framework through a thin adapter.
  - `rewriteImports`, `RewriteOptions`: an AST-based import rewriter that parses JS/TS sources with
    `@deno/graph`'s `parseModule`, locates the character spans of bare-specifier imports, and
    splices them back by absolute offset using a caller-supplied
    `resolveBareSpecifier(spec) → url | undefined` callback. The callback API keeps the rewriter
    framework-agnostic; the example's `/@modules/<spec>` allowlist is one possible mapping, not a
    hard-coded assumption. `RewriteOptions.failAsErrorBody` catches rewrite errors and returns a JS
    `throw new Error("rewrite failed for <specifier>: <message>");` body string (also
    `console.warn`d) so browser-facing dev servers surface failures inline as executable module
    bodies rather than as server-side 5xx.
  - `mimeFor`, `JS_MIME`, `DEFAULT_MIME`: a small MIME type table for dev-server static routes.
    POSIX and Windows separator support; hidden files like `.gitignore` resolve to `DEFAULT_MIME`
    (`"application/octet-stream"`). Inline `extname` avoids adding `@std/path` as a dependency.
  - `TranspileRequest.version`: caller-supplied invalidation token (e.g. source file mtime) compared
    against the cached entry on lookup; a mismatch evicts the entry and forces a fresh transform.
    When `undefined`, behavior is identical to the prior release — only TTL or LRU invalidates the
    entry.
  - `TranspileRequest.postProcess`: optional `(code) => string | Promise<string>` hook invoked after
    `esbuild.transform`. Its return value is what gets cached and returned; errors propagate and the
    failing call is not cached. Used by the example to layer `rewriteImports` over a transformed
    module body.
- New shared dependency: `jsr:@deno/graph@^0.110.2` (used by `rewriteImports` for AST parsing).
- `publish.include` in `packages/wrappers/shared/deno.json` updated to ship `mime.ts`,
  `rewrite_imports.ts`, and `router.ts` alongside `mod.ts`.
- `@ggpwnkthx/esbuild-wrapper-shared` sibling pins bumped from `^0.2.10` to `^0.3.1` in
  `packages/wrappers/hono/deno.json`, `packages/wrappers/oak/deno.json` (each cut to `0.2.11` in
  lockstep), and `examples/component-library/deno.json`.
- Shared package test coverage reorganized: new `tests/router.test.ts`,
  `tests/rewrite_imports.test.ts`, and `tests/mime.test.ts` replace the older
  `tests/router_and_rewrite.test.ts` so each new export is exercised next to its implementation.
  `tests/mod.test.ts` adds cases for `version`-based cache invalidation and `postProcess`
  success/error propagation.
- `packages/wrappers/shared/README.md`: documents every new export (`Router`/`Route`/
  `RouteContext`, `rewriteImports`/`RewriteOptions` with a field table, `mimeFor`/`JS_MIME`/
  `DEFAULT_MIME`) with usage examples.
- New workspace member `examples/component-library/`: a React component-library demo that authors
  Deno source and serves an unbundled ESM tree through `@ggpwnkthx/esbuild-wrapper-shared` +
  `@ggpwnkthx/esbuild-plugin-deno`.
  - `examples/component-library/src/serve.ts` boots a `deno serve` dev server that on-the-fly
    transpiles each `*.tsx`/`*.ts` request via `esbuild.transform`, runs the output through shared
    `rewriteImports` (using a callback wired to the local allowlist) to splice bare specifiers into
    `/@modules/<spec>` URLs, and bundles allowed npm modules on demand through
    `createDenoPlugin().build(spec)`. Routes are wired through shared `Router` + `Route` +
    `shouldTranspile` + `JS_MIME` + `mimeFor`; the per-file transform caches on shared `Transpiler`
    invalidated by `version = sourceMtimeMs`.
  - `examples/component-library/src/server/`: 7 files / 207 lines total (`allowlist.ts`, `paths.ts`,
    `plugin.ts`, `serve_module.ts`, `serve_static.ts`, `serve_transform.ts` + the entry `serve.ts`).
    No local `mime.ts` / `rewrite_imports.ts` / `router.ts` — those moved to shared. Old line count
    before the extraction was 10 files / 312 lines; net savings of ~105 lines and 3 files of
    duplicated logic.
  - `examples/component-library/src/Button.tsx` and `Card.tsx` are the published components (only
    the two ship in the example's JSR tarball via `publish.exclude`). `index.html`, `main.tsx`,
    `serve.ts`, `src/server/`, and `tests/` are dev-time only.
  - `examples/component-library/tests/`: `allowlist_test.ts` (allowlist shape), `router_test.ts`
    (shared `Router` dispatching), `serve_transform_test.ts` (local transform pipeline with
    mtime-based cache invalidation + `failureBody`), `selectors.ts` (shared test selectors and copy
    constants), `browser_test.ts` (headless Chromium end-to-end through `@astral/astral`).
- `deno.json` (root): `examples/**` added to `workspace`; `scopes` block now carries a single
  `./examples/` key redirecting `esbuild`, `@ggpwnkthx/esbuild-plugin-deno`, and
  `@ggpwnkthx/esbuild-wrapper-shared` to the local source paths during development (the previous
  draft key `./example/` did not match the actual workspace member name and is fixed here). Switched
  `nodeModulesDir` from `"none"` to `"auto"` so the example can resolve `npm:react` /
  `npm:react-dom`. Set `lock: false` — the workspace had no top-level `deno.lock` in this cycle and
  each member publishes its own tarball.
- `deno.lock`: deleted — `lock: false` makes the root lockfile redundant; each member manages its
  own dependency surface.
- `README.md` (root): repository-layout diagram lists `examples/` alongside `packages/` and
  `scripts/`.

### feat(deno-plugin): expand unbundle() with outbase, platform, CJS interop, and an in-memory API

- `packages/plugins/deno/{mod,unbundle,path,rewrite,utils,env,resolve,workspace}.ts`:
  `unbundleInMemory()` returns the same transpiled ESM tree as `unbundle()` in a
  `Map<string, Uint8Array>` for runtime flows. `unbundle()` and `unbundleInMemory()` gain `outbase`
  (project-rooted local output paths) and `platform` (`'browser' | 'node' | 'neutral'`) options.
  CommonJS modules are now bundled per module with co-located `__commonJS` runtimes; ESM named
  imports against a CJS dependency are rewritten to import a local default shim and destructure.
  `path.ts` was rewritten as a scheme-dispatch table that also recognises the global
  `npm/registry.npmjs.org/<name>/<version>/` cache layout and normalises `outbase` with
  `path.resolve()`. `mod.ts` now delegates `publicEnvVarPrefix` inlining to `env.ts`, importer
  substitution to `resolve.ts`, and `WorkspaceOptions` construction to `workspace.ts`. `utils.ts`
  adds `hasUrlScheme()` and `schemeToNamespace()` and switches the loader / platform maps to a
  table-driven shape.
- `packages/plugins/deno/tests/{unbundle,utils,resolve}.test.ts`: new tests covering the new
  options, the per-module CJS conversion, the in-memory API, and `resolveImporter` semantics.
- `packages/plugins/deno/{README,CHANGELOG,deno.json}`: README and CHANGELOG updated; `env.ts`,
  `resolve.ts`, and `workspace.ts` added to `publish.include`.

### chore(esbuild): release 0.2.14 (stable) and sync dependent pins

- `packages/esbuild/CHANGELOG.md`: added the `[0.2.14]` stable-cut entry (identical content to
  `0.2.14-rc.0`).
- `packages/plugins/{css,deno}/deno.json` and `packages/wrappers/{hono,oak,shared}/deno.json`:
  `jsr:@ggpwnkthx/esbuild@^0.2.14-rc.0` pins rewritten to `jsr:@ggpwnkthx/esbuild@^0.2.14` by
  `deno task versions:sync` so each published tarball resolves the new stable source.

### chore(workspace): add examples/component-library member and enable npm cache

- `deno.json` (root): added `./examples/component-library` to `workspace`; added a matching `scopes`
  block redirecting `esbuild` and `@ggpwnkthx/esbuild-plugin-deno` to the local source paths during
  development; switched `nodeModulesDir` from `"none"` to `"auto"` so the example can resolve
  `npm:react` / `npm:react-dom`; set `lock: false` (the workspace has no top-level `deno.lock` and
  each member owns its own dependency surface).
- `deno.lock`: deleted — `lock: false` makes the root lockfile redundant, and each member publishes
  its own tarball.
- `examples/component-library/`: new workspace member that demonstrates authoring Deno source and
  serving an unbundled ESM tree with `@ggpwnkthx/esbuild-plugin-deno` — `src/serve.ts` is a
  `deno serve` module that calls `unbundleInMemory()` at module load and resolves `/📦/<rel>`
  against the in-memory map. `tests/browser_test.ts` runs a headless Chromium end-to-end check.
  `publish.exclude` drops the demo (`index.html`, `main.tsx`, `serve.ts`) and tests from the
  example's published tarball.

### simplify(ci): adopt JSR-canonical publish step in workflow chain

- `.github/workflows/publish.yml`: rewritten to the JSR docs publish pattern
  (`actions/checkout@v6` + `npx jsr publish`) inlined in each of the three matrix jobs
  (`publish-base` → `publish-deps` → `publish-wrappers`). Workflow-level
  `permissions: contents: read, id-token: write` retained; job-level permissions retained for
  clarity. The `denoland/setup-deno@v2` and `actions/cache@v5` steps are removed — `npx jsr publish`
  ships its own Deno binary internally (`jsr-io/jsr-npm/src/deno_version.ts`, currently `v2.6.7`)
  and manages its own cache. Removed the post-publish `Inspect published version` step that
  previously tailed `/tmp/diagnose.log` and `/tmp/publish.log`; the upstream provenance
  investigation continues out of band. Outcome for `0.2.14-rc.0` is unchanged by this commit:
  `rekorLogId` is still `null` because `npx jsr publish` shells out to the same Deno CLI that signs
  the metadata hash while JSR's `provenance::verify` (after `jsr-io/jsr#1465`) requires the tarball
  hash. The fix lives in `denoland/deno` (signature in `cli/tools/publish/mod.rs`).
- `.github/actions/publish-package/action.yml`: deleted. The composite action was a wrapper around
  `working-directory: ${{ inputs.package }}` + `run: deno publish`; inlining `npx jsr publish`
  directly in each job's step removes a layer without changing behavior.
- Workflow-level `env: DENO_VERSION: "2.9.4"` removed (only consumed by `setup-deno@v2`).

### fix(ci): debug JSR OIDC provenance under deno publish + cut 0.2.14-rc.0

- `.github/actions/publish-package/action.yml`: reverted the publish step from
  `npx --yes jsr publish` back to `deno publish` (the pre-`e64866f` state). The npm-CLI swap
  targeted the wrong hypothesis: in this codebase `deno publish` produced `rekorLogId` for releases
  0.2.0–0.2.8 (May–June) without `npx jsr` ever being involved, so swapping CLIs is unlikely to be
  the root cause. Instead, capture the issue on its native path with full visibility.
- `.github/actions/publish-package/action.yml`: prepended a `Diagnose OIDC environment` composite
  step that runs before the publish. It logs the GitHub-Actions OIDC-related env vars
  (`GITHUB_ACTIONS`, `ACTIONS_ID_TOKEN_REQUEST_URL`, `ACTIONS_ID_TOKEN_REQUEST_TOKEN`,
  `GITHUB_REPOSITORY`, `GITHUB_WORKFLOW_REF`, `GITHUB_REF`, `GITHUB_SHA`, `GITHUB_RUN_ID`,
  `RUNNER_ENVIRONMENT`), the installed `deno --version` first line, the working directory, and the
  package coordinates from `deno.json`. If both `ACTIONS_ID_TOKEN_REQUEST_*` vars are present it
  also probes the OIDC request URL with `audience=sigstore` (the exact audience `deno publish` uses
  per `cli/tools/publish/provenance.rs`) and saves the response to `/tmp/oidc.json`. The whole block
  is `tee`'d to `/tmp/diagnose.log` for the post-publish inspection step to read.
- `.github/actions/publish-package/action.yml`: wrapped the `deno publish` step in `tee` so the full
  `DENO_LOG=debug` stream is captured to `/tmp/publish.log`. `set -o pipefail` plus
  `exit "${PIPESTATUS[0]}"` keeps the original Deno exit code so the step still fails fast on
  publish error — `tee` alone would have masked failures.
- `.github/workflows/publish.yml`: added an `Inspect published version` step with `if: always()`
  after the composite action call in each of the three matrix jobs. The step reads the package
  `name`/`version` from `deno.json`, calls
  `GET https://jsr.io/api/scopes/{scope}/packages/{name}/versions/{version}` (no auth, public),
  prints `{version, rekorLogId, usesNpm}` via `jq`, and tails the last 60 lines of
  `/tmp/publish.log` and `/tmp/diagnose.log`. Diagnostic-only — does not fail the job.
- `packages/esbuild/deno.json`: bumped `"version"` from `0.2.13` to `"0.2.14-rc.0"` so the publish
  workflow has one new version to push through the reverted `deno publish` path. The rc prerelease
  keeps `0.2.13` from being auto-eclipsed on the `latest` tag until diagnostics are reviewed.
- `deno task versions:sync` (run, not committed directly): rewrote five sibling
  `jsr:@ggpwnkthx/esbuild@^0.2.13` pins in `packages/wrappers/{shared,hono,oak}/deno.json` and
  `packages/plugins/{deno,css}/deno.json` to `jsr:@ggpwnkthx/esbuild@^0.2.14-rc.0` to track the
  local source. Other packages' `version` fields were left untouched because their existing JSR
  versions are unchanged — `deno publish` will skip them in the workflow run.
- Decision table for the post-run read-back (no code changes implied, just routing):
  | What JSR reports                                         | Interpretation                                                                                                                               | Next action                                                                |
  | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
  | `usesNpm: false, rekorLogId: <non-null>`                 | `deno publish` works; root cause was the timing/coordination that produced the 0.2.13 read-back, not a workflow bug.                         | Cut `0.2.14`, decide whether to yank `0.2.13`.                             |
  | `usesNpm: false, rekorLogId: null`, publish step exits 0 | Server-side provenance rejection; capture `DENO_LOG` line for the error. Inspect `/tmp/publish.log` for the JSR `/provenance` POST response. | Apply the fix implied by the captured error class (see commit body).       |
  | OIDC env probe in `/tmp/diagnose.log` shows vars missing | OIDC token not actually issued to the runner.                                                                                                | Re-check `publish.yml` permissions and composite-action shell inheritance. |
  | `usesNpm: true` after publish                            | Deno 2.9.x silently delegated to the npm CLI under the hood — informational, provenance is recorded if `rekorLogId` is non-null.             | Document behavior in CHANGELOG.                                            |
- `packages/esbuild/CHANGELOG.md`: corresponding `[0.2.14-rc.0]` entry (release coordination; no
  behavioral change vs. `0.2.13`).

### fix(ci): restore JSR OIDC provenance by publishing through the npm CLI

- `.github/actions/publish-package/action.yml`: switched the publish step from `deno publish` to
  `npx --yes jsr publish`. The Deno CLI invocation introduced in `0b1e8ee` has not been producing
  Sigstore Rekor entries since 2026-07-24 (versions 0.2.9 through 0.2.12 of `@ggpwnkthx/esbuild`
  report `"rekorLogId": null` and `usesNpm: false` in the JSR version API, and the JSR score page
  reads "Has provenance 0/1"). The JSR npm CLI is the canonical OIDC publishing path —
  `@ggpwnkthx/deno-csr` continues to publish via `npx jsr publish` and gets a Rekor entry on every
  release — so switching all six workspace members back to the npm CLI should restore provenance for
  the upcoming `0.2.13` cycle. Verify via
  `https://jsr.io/api/scopes/ggpwnkthx/packages/esbuild/versions/0.2.13` and confirm `rekorLogId` is
  non-null and `usesNpm` is `true`.
- `.github/workflows/publish.yml`: added a workflow-level `permissions:` block declaring
  `contents: read` and `id-token: write`. All three existing publish jobs already declare the same
  two permissions at the job level, so this is a forward-looking default rather than a behavioral
  change — a future job that forgets to set `permissions:` will still get the OIDC token it needs.
  Cannot narrow the current token scope.

## 429bad - 2026-07-24

### feat(workspace): local sibling imports via scope overrides + version sync script

- `deno.json` (root): added a `scopes` block that redirects each member's `jsr:@ggpwnkthx/...`
  imports to the local sibling directory during development (`./packages/plugins/deno/` →
  `../esbuild/mod.ts`, etc.). The root `scopes` block is not part of any published package, so each
  member's `deno.json` continues to ship `jsr:@ggpwnkthx/<name>@^<version>` references for JSR
  consumers, and `deno info` confirms that during development `esbuild` (and
  `@ggpwnkthx/esbuild-wrapper-shared` for the wrapper packages) resolves to a
  `file:///workspace/deno-esbuild/packages/...` path instead of a JSR URL.
- `scripts/sync_versions.ts`: new std-only script that walks every workspace member's `deno.json`,
  builds a `name → version` map, and rewrites each member's sibling `jsr:@ggpwnkthx/<name>@<old>`
  pin to `jsr:@ggpwnkthx/<name>@^<local>`. Idempotent; supports `--check` for CI. Wired up as
  `deno task versions:sync` and `deno task versions:check`.
- `packages/plugins/{deno,css}/deno.json` and `packages/wrappers/{shared,hono,oak}/deno.json`:
  sibling `esbuild` pins updated from `jsr:@ggpwnkthx/esbuild@^0.2.9` to
  `jsr:@ggpwnkthx/esbuild@^0.2.11` to match the local `@ggpwnkthx/esbuild` package version. Applied
  by `deno task versions:sync`; future version bumps will be reflected in sibling pins by the same
  script before publishing.
- `CONTRIBUTING.md`: added a "Releasing" section describing the workflow (bump version →
  `deno task versions:sync` → `deno publish` per member in dependency order) and noting that
  `deno task versions:check` can guard the repo against drift.

## 6b4f86b - 2026-07-24

### fix(ci): quote composite action `run` value to avoid YAML mapping parse error

- `.github/actions/publish-package/action.yml`: wrapped the `Select package` step's `run` value in
  single quotes. The previous value
  `run: echo "Skipping ${{ inputs.package }} (selected: ${{ github.event.inputs.package }})"` was
  misevaluated by the runner's YAML parser at column 58: the `:` after `selected` followed by a
  `${{ ... }}` expression was read as a nested mapping, producing
  `System.ArgumentException: Unexpected type '' encountered while reading 'action manifest root'.
  The type 'MappingToken' was expected.`
  and failing the `publish-base (packages/esbuild)` job before any step ran. Single-quoting the
  whole scalar makes the YAML parser treat it as a literal string while preserving the inner
  `${{ ... }}` expressions for GitHub Actions to evaluate.

## 372a70e - 2026-07-24

### fix(ci): checkout repo before resolving local publish action

- `.github/workflows/publish.yml`: each of the three jobs (`publish-base`, `publish-deps`,
  `publish-wrappers`) now runs `actions/checkout@v6` (with
  `ref: ${{ github.event.workflow_run.head_sha }}` when triggered by `workflow_run`, or a plain
  checkout when triggered by `workflow_dispatch`), `denoland/setup-deno@v2`, and `actions/cache@v5`
  before the `uses: ./.github/actions/publish-package` step. The `workflow_run` trigger starts the
  runner with an empty workspace, so GitHub could not resolve the local composite action's
  `action.yml` and the publish job failed immediately with
  `Can't find 'action.yml', 'action.yaml' or 'Dockerfile' under '.github/actions/publish-package'`.
  Moving the checkout to the calling workflow ensures the local action is on disk before the runner
  tries to resolve it.
- `.github/actions/publish-package/action.yml`: slimmed down to just the package-selection filter
  and the `deno publish` invocation. The checkout, setup-deno, and cache steps previously inlined
  inside the composite action were too late — they ran only after the action had already failed to
  resolve — and have moved up into `publish.yml` alongside the new checkout.

## bcf90c - 2026-07-24

### docs(changelog): record 0.2.9 notes across all packages

- Added a `0.2.9` entry to every package CHANGELOG covering the synchronized version bump, the
  repo-wide `deno fmt` style sweep (singleQuote, no semiColons, lineWidth 100), and the adoption of
  strict `compilerOptions` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`).
- Packages without a prior `0.2.9` entry also gained backfill entries for `0.2.0`–`0.2.8` so each
  per-package changelog has a complete history. The `@ggpwnkthx/esbuild-wrapper-shared` entry on the
  upcoming `0.2.10` cycle documents the breaking move from a module-level `responseCache` +
  `getCachedOrTranspile` export to a `createTranspiler()` factory.
- `packages/plugins/deno/CHANGELOG.md` also gained `0.2.9` entries under `### Fixed` describing
  `onLoad`'s `resolveDir` correction and the `onResolve` synthetic-referrer fix for npm cache paths.
  `packages/plugins/css/CHANGELOG.md` describes the `onLoad` namespace-predicate refactor and the
  `noUncheckedIndexedAccess` test update.

## c0afa99 - 2026-07-24

### chore(ci): run per-package `deno task ci` from a single job

- `.github/workflows/ci.yml`: collapsed the four-stage fmt/lint/check/test pipeline into a single
  `ci` job. The job uses `jq` to detect whether the package's `deno.json` declares a `ci` task and
  runs `deno task ci` when present, falling back to
  `deno fmt --check && deno lint && deno check && deno test -A` for packages that don't. The
  preceding `audit` job keeps its repo-wide scope.
- This trims the duplicated matrix setup (cache + checkout + setup-deno + step runs) down to a
  single block per package, and removes the need to keep the workflow in lockstep with every
  package's task surface.

## 9f70418 - 2026-07-24

### chore(net): allow release-assets.githubusercontent.com

- `packages/esbuild/README.md`: replaced `--allow-net=github.com` with
  `--allow-net=github.com,release-assets.githubusercontent.com` in both the initial-cache and
  native-binary examples, and called out in the permission table that GitHub redirects asset
  downloads to `release-assets.githubusercontent.com`.
- `packages/wrappers/hono/deno.json` and `packages/wrappers/oak/deno.json`: appended
  `release-assets.githubusercontent.com` to the `--allow-net` list on the `test` and `ci` tasks so
  the wrapper test suites can follow the same redirect when downloading esbuild binaries.

## dcd67c2 - 2026-07-24

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
