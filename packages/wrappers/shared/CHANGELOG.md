# Changelog

All notable changes to `@ggpwnkthx/esbuild-wrapper-shared` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-07-27

### Added

- `Router`, `Route`, and `RouteContext` exports: a framework-agnostic ordered route dispatcher. Each
  `Route` is a `{ match, handle }` pair and `router.dispatch(req, ctx)` returns the first matching
  route's response (or a 404). The `Route` shape is intentionally compatible with both Hono and Oak
  handlers so the same route list can be adapted into either framework through a thin wrapper.
- `rewriteImports` and `RewriteOptions` exports: an AST-based import rewriter that parses a JS/TS
  source string with `@deno/graph`'s `parseModule`, locates the character spans of bare-specifier
  imports, and splices them back in by absolute offset with caller-supplied replacement URLs. The
  rewriter takes a `resolveBareSpecifier` callback so consumers (Hono, Oak, or any other framework)
  can map bare specifiers to whatever URL scheme they prefer; the example dev server's
  `/@modules/<spec>` allowlist is one possible mapping, not a hard-coded assumption.
- `CacheEntry.version` and `TranspileRequest.version`: caller-supplied invalidation token (e.g.
  source file mtime) compared against the cached entry on lookup. A mismatch evicts the entry and
  forces a fresh transform. When `version` is `undefined`, behavior is identical to the prior
  release — the cache only invalidates via TTL or LRU eviction. Lets dev-server consumers pick up
  source edits without waiting for TTL expiry.
- `TranspileRequest.postProcess`: optional callback `(code) => string | Promise<string>` invoked
  after `esbuild.transform`. Its return value is what gets cached and returned to the caller. Useful
  for dev-server pipelines that need to run an additional step (e.g. the bundled `rewriteImports`
  helper) before serving the response. Errors propagate; the failing call is not cached.
- `mimeFor`, `JS_MIME`, and `DEFAULT_MIME` exports: a small MIME type table for dev-server routes
  that serve static files alongside transpiled JS modules. `mimeFor(path)` looks up the
  `content-type` by lowercased extension (POSIX and Windows separators), returning `DEFAULT_MIME`
  (`"application/octet-stream"`) for unknown extensions. Inline `extname` helper avoids adding
  `@std/path` as a dependency.
- `RewriteOptions.failAsErrorBody`: when `true`, errors thrown during rewriting are caught and
  converted to a JS `throw new Error("rewrite failed for <specifier>: <message>");` body string
  instead of propagating. The error is also logged via `console.warn`. Useful for browser-facing dev
  servers that want to surface a loud failure inline as an executable module body rather than as a
  server-side 5xx. (Default: `false` — preserves today's throw-on-error behavior.)
- New test files: `tests/router.test.ts`, `tests/rewrite_imports.test.ts`, and `tests/mime.test.ts`
  (the first two replace a private `tests/router_and_rewrite.test.ts` so the new exports are tested
  next to their implementations).

### Changed

- New dependency: `jsr:@deno/graph@^0.110.2` (used by `rewriteImports` for AST parsing).
- `publish.include` updated to ship `mime.ts`, `router.ts`, and `rewrite_imports.ts` alongside
  `mod.ts`.
- `README.md`: documented `Router`/`Route`/`RouteContext`, `rewriteImports`/`RewriteOptions` (with
  every `RewriteOptions` field, including `failAsErrorBody`), and `mimeFor`/`JS_MIME`/`DEFAULT_MIME`
  with usage examples for each.
- Cache miss semantics: the version-mismatch check happens before the TTL check, so explicit
  invalidation always wins over TTL when both would evict. Pre-existing TTL-only behavior is
  preserved when `version` is `undefined`.

### Notes

- Patch release after the rolled-back `0.3.0`. The `Router`, `Route`, and `rewriteImports` exports
  that originally shipped in `0.3.0` are reintroduced unchanged alongside the additional
  `postProcess`, `version`, `mimeFor`, and `failAsErrorBody` features that didn't make it into the
  earlier cut.

## [0.2.10] - 2026-07-24

### Changed

- Last synchronized version bump across all `@ggpwnkthx/*` packages in this workspace. Future
  versions of this package will be released independently.
- **Breaking**: the module-level `responseCache` and the standalone `getCachedOrTranspile` export
  were removed. The shared library now exposes a `createTranspiler()` factory that returns a
  `Transpiler` bound to its own in-memory response cache. Each wrapper (Hono, Oak) constructs a
  `Transpiler` at setup time and calls `transpiler.getCachedOrTranspile()` per request, so the cache
  is per-instance rather than module-global.
- `README.md`: rewritten to describe the new `createTranspiler()` factory and the per-instance
  `Transpiler` contract.

## [0.2.9] - 2026-07-24

### Changed

- Synchronized version bump across all `@ggpwnkthx/*` packages in this workspace.
- Repo-wide `deno fmt` style sweep (`singleQuote`, no `semiColons`, `lineWidth` 100) applied across
  `mod.ts`.
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

- Initial release of `@ggpwnkthx/esbuild-wrapper-shared` as part of the monorepo split.
- `mod.ts`: the shared transpiler helper used by the Hono and Oak wrappers, including the default
  extension / content-type constants and the in-memory response cache.
