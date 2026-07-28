# Changelog

All notable changes to `@ggpwnkthx/esbuild-plugin-commonjs` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-07-28

### Added

- `extractCjsExports(source, options?)` — pure scan that returns the statically-resolvable
  `exports.X = Y` names from a CJS source string (with their `dynamic` flag for unrecognised
  shapes). Walks into `if/else`, `try/catch/finally`, `for/while/do`, `with`, and other block-shaped
  statements so names declared in process.env-gated branches are still found. Useful for consumers
  (dev servers, bundlers) that want to forward a static list of names through a destructure shim
  without hand-maintaining the list per package. Re-exported from the package's `.` subpath so
  consumers can invoke it directly without reaching into `./transform.ts`.
- `TransformOptions.onDynamicExport` — optional callback for unrecognised export shapes (computed
  keys, `Object.assign(exports, ...)`, `module.exports = function/class/expr`). Lets callers surface
  a one-shot warning to the operator when a CJS file uses a shape the transform can't statically
  forward.
- `CommonjsPluginOptions.onDynamicExport` — forwarded to the transform via `onDynamicExport`.
- Re-exports `{ extractCjsExports, looksLikeCjs, transform }` (and the `CjsExportsScan` /
  `TransformOptions` / `TransformResult` types) from the package's `.` subpath so consumers can
  invoke them directly without reaching into `./transform.ts`.

### Fixed

- `exports.X = Y` assignments at module top scope are now rewritten to `const X = Y; export { X };`
  instead of being left in place (which would have thrown `ReferenceError: exports is not defined`
  at runtime once esbuild's `__commonJS` wrapper stripped the `module` / `exports` bindings). Names
  declared via top-level `function X() {}` / `var X = …` are surfaced without a redundant
  `const X = …;` to avoid duplicate declarations; the rewrite skips emitting `const X = Y;` when `X`
  is already bound at module top scope. Last-write-wins on duplicate `exports.X = …` assignments
  (matching the runtime `module.exports` shape). Unrecognised shapes (computed keys, top-level
  `exports = …` reassignment) trigger `onDynamicExport` rather than silently dropping the rewrite.
- `tests/mod.test.ts`: new `plugin — surfaces`exports.X = Y`named exports through bundling`
  integration test (with backing `tests/fixtures/cjs-named-exports.js` fixture) asserts the
  end-to-end bundle no longer carries the `exports.X = …` assignment that used to throw at runtime.

### Changed

- `deno.json`: version bumped to `0.1.1`. The `0.1.0` baseline was rolled back in
  `8392dc2 feat(esbuild-plugin-commonjs): add CJS-to-ESM plugin and register in workspace` and
  re-cut here as `0.1.1` with the new `exports.X = Y` fix and the `extractCjsExports` /
  `onDynamicExport` API surface.

## [0.2.0] - 2026-07-27

### Added

- Initial release. esbuild plugin that detects CommonJS source files (`module.exports = X`,
  `exports.X = Y`, `require("mod")`, `__dirname`, `__filename`) and re-bundles them through
  esbuild's `format: "esm"` pass so the bundler treats them as ESM at link time. The transform
  itself is a hand-rolled TypeScript AST walker in `transform.ts` that uses `acorn` for parsing and
  `astring` for code generation — no Babel runtime, no SWC binary. The recognised CJS shapes
  (top-level `require(spec)`, `var X = require(spec)`, `var { a, b } = require(spec)`,
  `module.exports = X`, `module.exports = { ... }`, `module.exports = require(mod)`) are rewritten
  to the equivalent ESM. Recognised CJS files are detected by a fast text-based pre-pass
  (`looksLikeCjs`). A false positive just causes an unnecessary parse + AST walk; the downstream
  acorn+astring walker handles strings and comments correctly, so the no-op path stays cheap.
- `CommonjsPluginOptions`:
  - `filter?: RegExp | RegExp[]` — only transform files whose path matches one of these regexes;
    defaults to every loaded `.c?[jt]sx?` file.
  - `sourcemap?: boolean` — whether to emit a source map for the transformed output. Off by default
    (the dev server doesn't need source maps and esbuild caches the `onLoad` content either way).
