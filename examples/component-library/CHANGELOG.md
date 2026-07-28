# Changelog

All notable changes to `examples/component-library` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This is a workspace member of
[`deno-esbuild`](https://github.com/ggpwnkthx/deno-esbuild) and is not published to JSR, so it has
no version.

## [Unreleased]

### Changed

- The hand-rolled `src/Button.tsx` and `src/Card.tsx` library has been removed. `src/main.tsx` now
  renders `@mui/material`'s `Button`, `Card`, `CardContent`, and `Typography` directly. The
  associated `data-testid` (`gg-button`, `gg-card`) and BEM CSS rules (`gg-btn`, `gg-card__title`,
  etc.) are gone with them; the smoke test now asserts on MUI's class hooks (`MuiButton-root`,
  `MuiCard-root`, `MuiTypography-h5`, `MuiTypography-body2`) via `tests/selectors.ts`.
- `deno.json` now imports `@mui/material@^9.2.0` (subpaths `Button`, `Card`, `CardContent`,
  `Typography`) plus the two MUI peer dependencies `@emotion/react@^11.14.0` and
  `@emotion/styled@^11.14.1`. The `react/jsx-runtime`, `react/jsx-dev-runtime`, and
  `react-dom/client` subpaths were added to the `imports` map (the demo stays on React 18) so
  esbuild's automatic JSX transform output is rewriteable to `/@modules/<spec>` URLs alongside the
  rest. The `@ggpwnkthx/esbuild-wrapper-shared` dependency was bumped from `^0.3.1` to `^0.3.3` to
  pick up the scoped-specifier fix in `isBareSpec` and the `.js`-suffix normaliser that lets
  `parseModule` return non-zero spans for npm-bundled output like MUI's.
- The `publish` block in `deno.json` was removed: with no `Button.tsx` / `Card.tsx` to ship, the
  example no longer publishes anything. The `examples/component-library/README.md` documents this;
  the only artefacts under `src/` are now `main.tsx`, `index.html`, `serve.ts`, and the `server/`
  helpers, none of which are library code.
- The hand-maintained `CJS_REEXPORT_TABLE` in `src/server/serve_module.ts` is gone. The shim now
  derives named exports from the underlying CJS source by walking the AST with `extractCjsExports`
  (re-exported from `@ggpwnkthx/esbuild-plugin-commonjs`); the walker recurses into `if/else`,
  `try/catch/finally`, `for`/`while`, and other block statements, so it picks up shapes like
  `react-dom/client`'s `if (process.env.NODE_ENV === 'production') { … }` branches without a
  hand-maintained list. If the scan encounters a CJS export shape it can't statically resolve
  (computed keys, `Object.assign(exports, ...)`, `module.exports = function/class/expr`), it warns
  the dev-server console once per unique message and falls through to the `export * from` shim —
  consumers see `undefined` for the missed name rather than a hard build failure. Upgrading to a
  future React major (e.g. 19) picks up new hooks/component helpers automatically without editing
  this example.

### Added

- `src/server/serve_module.ts` now has two shim shapes. CommonJS-only npm specs feed a destructure
  generated from a dynamic AST scan into
  `import * as ns from "<abs>"; const { …names } = ns; export { …names }; export default ns;`. Every
  other npm spec (MUI, Emotion, anything that ships a real ESM module) feeds
  `export * from "<abs>"; export { default } from "<abs>";` into esbuild's CJS-to-ESM bridge. The
  result is one fully-bundled ESM module per `/@modules/<spec>` URL with the right surface either
  way.

### Fixed

- The "multiple copies of React" diagnosis that previously blocked MUI from rendering in the browser
  has been resolved. `react` is now externalised via `reactExternalPlugin(spec)` in
  `src/server/serve_module.ts` for every non-React bundle, so the browser fetches `/@modules/react`
  once and reuses the cached module for MUI, `react-dom`, `react-dom/client`, `react/jsx-runtime`,
  and `react/jsx-dev-runtime`. `react-dom` and the two `react/jsx-*` modules are bundled per route
  as self-contained modules (sharing them with React would create a cycle the browser resolves with
  a partial-export namespace whose `__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED` is still
  `undefined`). The CJS-bridged bundles' inner `require("react")` calls are rewritten to a static
  `import * as __React0 from "/@modules/react";` reference by
  `neutralizeDynamicReactRequires(spec)`, so the CJS-bundled code reads from the shared module's
  namespace import instead of trying to call a non-existent `require`. With the fix in place,
  `tests/browser_test.ts` now asserts on a fully-rendered MUI tree (the `MuiButton-root` and
  `MuiCard-root` class hooks, the `MuiTypography-h5` title, and the click counter updates from
  `Clicked 0 times` to `Clicked 2 times` after two clicks), and the `README.md` "How React is shared
  across bundles" section documents the architecture.

### Removed

- `deno.lock` was deleted. The workspace root's `deno.json` sets `"lock": false`, and Deno 2.x
  rejects `"lock"` overrides in workspace members, so the example's previous lockfile (which only
  tracked React and was already stale relative to the new MUI/Emotion tree) could no longer be
  regenerated in this state. Packages continue to resolve via the workspace's `node_modules` and
  Deno's global cache. To restore reproducible lockfile behaviour, flip the workspace root's
  `"lock"` to `true` and re-run `deno install`.
