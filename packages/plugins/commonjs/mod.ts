/**
 * @ggpwnkthx/esbuild-plugin-commonjs
 *
 * esbuild plugin that turns CommonJS source files into ESM at the
 * `onLoad` step. The actual CJS-to-ESM conversion is done by the
 * hand-rolled TypeScript `transform` in `./transform.ts` (acorn +
 * astring), so the plugin is a Deno-first thin shim — no Babel
 * runtime, no SWC binary.
 *
 * The motivating use case is bundling npm packages whose published
 * CJS source does `require("react")` (or similar) at module scope
 * into a browser-targeted ESM payload: esbuild's built-in CJS-to-ESM
 * conversion leaves those calls as a `__require` helper that the
 * browser can't satisfy. The transform rewrites those calls to static
 * `import` statements, which the browser's module loader handles.
 *
 * The same transform also handles `exports.X = Y` at module top
 * scope, rewriting it to `const X = Y; export { X }`. Previously
 * those assignments were left in place (which silently threw at
 * runtime in ESM); the fix makes the named-export forward
 * statically resolvable. See `./transform.ts` for the full pattern
 * catalogue.
 */

import * as esbuild from 'esbuild'
import { extractCjsExports, looksLikeCjs, transform, type TransformOptions } from './transform.ts'

/** Options accepted by {@linkcode commonjsPlugin}. */
export interface CommonjsPluginOptions {
  /**
   * Only transform files whose path matches one of these regexes. If
   * omitted, every loaded `.c?[jt]sx?` file is considered.
   */
  filter?: RegExp | RegExp[]

  /**
   * Whether to emit a source map for the transformed output. Off by
   * default — the dev server doesn't need source maps and the `onLoad`
   * callback's content is cached by esbuild either way.
   */
  sourcemap?: boolean

  /**
   * Forwarded to {@linkcode transform}'s `onDynamicExport`. Called
   * when the transform sees a CJS export shape it can't statically
   * forward (computed keys, `Object.assign(exports, ...)`, etc.).
   * Use it to log a one-shot warning to the operator — the resulting
   * ESM still emits, but some named exports may be missing.
   */
  onDynamicExport?: TransformOptions['onDynamicExport']
}

// Re-export `transform` and `extractCjsExports` so consumers can
// invoke them directly without reaching into the `./transform.ts`
// subpath (the package's `exports` map only exposes `.`).
export { extractCjsExports, looksLikeCjs, transform }
export type { CjsExportsScan, TransformOptions, TransformResult } from './transform.ts'

const DEFAULT_LOADER_FILTER = /\.[cm]?[jt]sx?$/

/**
 * esbuild plugin that pre-transforms CJS source files to ESM via
 * the hand-rolled TypeScript `transform` in `./transform.ts`. The
 * plugin only does meaningful work for `format: "esm"` output —
 * esbuild's built-in CJS handling is the right thing for CJS / IIFE
 * output formats.
 */
export default function commonjsPlugin(
  options: CommonjsPluginOptions = {},
): esbuild.Plugin {
  const { filter, sourcemap = false, onDynamicExport } = options
  const filters = filter ? Array.isArray(filter) ? filter : [filter] : null

  return {
    name: '@ggpwnkthx/esbuild-plugin-commonjs',
    setup(build: esbuild.PluginBuild): void {
      // Only meaningful for ESM output — esbuild's built-in CJS
      // handling is the right thing for CJS / IIFE output formats.
      const format = build.initialOptions.format
      if (format !== undefined && format !== 'esm') return

      build.onLoad(
        { filter: DEFAULT_LOADER_FILTER },
        (args: esbuild.OnLoadArgs) => {
          if (filters !== null && !filters.some((re) => re.test(args.path))) {
            return null
          }

          // Synchronous file read + transform. The transformer is a
          // pure-function AST walk; for React-DOM's 30k-line
          // `cjs/react-dom-client.development.js` it runs in tens of
          // ms, well within esbuild's per-load budget.
          let source: string
          try {
            source = Deno.readTextFileSync(args.path)
          } catch {
            return null
          }

          if (!looksLikeCjs(source)) return null

          const result = transform(source, {
            sourcefile: args.path,
            sourcemap,
            onDynamicExport,
          })
          return { contents: result.code, loader: 'js' }
        },
      )
    },
  }
}
