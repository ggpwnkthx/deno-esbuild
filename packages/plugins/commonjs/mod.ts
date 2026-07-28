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
 */

import * as esbuild from 'esbuild'
import { looksLikeCjs, transform } from './transform.ts'

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
}

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
  const { filter, sourcemap = false } = options
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
          })
          return { contents: result.code, loader: 'js' }
        },
      )
    },
  }
}
