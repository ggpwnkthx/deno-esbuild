# Changelog

All notable changes to `@ggpwnkthx/esbuild-plugin-commonjs` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
