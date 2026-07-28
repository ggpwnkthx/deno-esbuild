import type { DenoPluginHandle } from '@ggpwnkthx/esbuild-plugin-deno'
import { extractCjsExports, looksLikeCjs } from '@ggpwnkthx/esbuild-plugin-commonjs'
import * as esbuild from '@ggpwnkthx/esbuild'
import { JS_MIME, rewriteImports } from '@ggpwnkthx/esbuild-wrapper-shared'
import * as path from '@std/path'

/**
 * Recursively walk a CJS wrapper chain looking for the first source
 * with statically-resolvable named exports (`exports.X = Y`).
 *
 * Most npm CJS packages ship a thin `index.js` whose only CJS surface
 * is `module.exports = require('./cjs/whatever.development.js')`. The
 * actual `exports.X = Y` lines live one or two levels deeper. This
 * helper follows the chain and runs the commonjsPlugin's
 * {@linkcode extractCjsExports} scan at the leaf.
 *
 * Returns `[]` when no static exports are found (caller falls through
 * to the generic `export * from "<abs>";` shim, which works for ESM
 * packages).
 *
 * The scan runs once per `/@modules/<spec>` request; esbuild caches
 * the bundle output keyed on its own internal content hash so the
 * repeated work per request is just an acorn parse, not a re-bundle.
 */
async function discoverCjsExports(absPath: string): Promise<readonly string[]> {
  const visited = new Set<string>()
  const dynamicMessages = new Set<string>()
  let current = absPath
  for (let depth = 0; depth < 5; depth++) {
    if (visited.has(current)) return []
    visited.add(current)
    let source: string
    try {
      source = await Deno.readTextFile(current)
    } catch {
      return []
    }
    if (!looksLikeCjs(source)) return []
    const scan = extractCjsExports(source, {
      onDynamicExport: (msg: string) => dynamicMessages.add(msg),
    })
    if (scan.names.length > 0) {
      // Warn once per unique message. Prevents spamming the dev
      // console on every request for the same spec; the Set collapses
      // duplicates across the chain-follow.
      for (const msg of dynamicMessages) {
        if (!warnedDynamicExports.has(msg)) {
          console.warn(
            `[serve_module] ${current}: ${msg}; some CJS exports may be missing from the shim`,
          )
          warnedDynamicExports.add(msg)
        }
      }
      return scan.names
    }
    // No named exports at this level — try to follow one wrapper hop
    // (`module.exports = require('./cjs/foo.js')`).
    const match = source.match(
      /module\.exports\s*=\s*require\(\s*(['"])(\.{1,2}\/[^'"]+)\1\s*\)/,
    )
    if (!match) return []
    const target = match[2]
    if (!target) return []
    current = path.join(path.dirname(current), target)
  }
  return []
}

const warnedDynamicExports = new Set<string>()

/**
 * Specs that must be shared across every served bundle rather than inlined.
 * Each is built once into its own `/@modules/<spec>` URL; the browser fetches
 * the URL once and reuses the cached module for every dependent bundle.
 *
 * Only `react` is shared. `react-dom`, `react-dom/client`, `react/jsx-runtime`,
 * and `react/jsx-dev-runtime` are bundled independently — inlining them
 * per route keeps the import graph acyclic. (Sharing them as well as
 * `react` would force the React bundle to import jsx-dev-runtime and
 * vice-versa, and the browser's ESM module loader would break the cycle
 * with a partial-export namespace whose `__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED`
 * is still `undefined`.)
 *
 * Sharing one copy of React between MUI and react-dom is required for
 * hooks to find `ReactSharedInternals.ReactCurrentDispatcher.current`: when
 * react-dom renders, it sets the dispatcher on its own React's internals;
 * the MUI component reads it via `useContext`. Different React copies =>
 * null dispatcher => "Cannot read properties of null (reading 'useContext')".
 */
const SHARED_REACT_SPECS = ['react'] as const

function isSharedReactSpec(spec: string): boolean {
  return (SHARED_REACT_SPECS as readonly string[]).includes(spec)
}

/**
 * esbuild plugin that marks bare `react` specifiers as external, rewriting
 * them to the canonical `/@modules/react` URL. The plugin is closed over
 * the current spec being built so it never externalises the bundle's own
 * spec — that would create an infinite loop in the browser (the bundle
 * would `import "/@modules/<self>"` and recurse forever).
 *
 * For ESM bundles esbuild emits `import * as ReactNNN from "<url>"`
 * statements; for CJS-bridged bundles the inner `require("react")` calls
 * are kept as `__require("<url>")` (no `require` exists in the browser).
 * {@linkcode neutralizeDynamicReactRequires} post-processes the CJS bundles
 * to redirect those calls to a static `import * as __React0 from "<url>"`
 * prelude so the browser can resolve them.
 */
function reactExternalPlugin(currentSpec: string): esbuild.Plugin {
  return {
    name: 'react-external',
    setup(build) {
      const filter = /^react$/
      build.onResolve({ filter }, (args) => {
        if (args.path === currentSpec) return null
        return { external: true, path: '/@modules/' + args.path }
      })
    },
  }
}

/**
 * Build the per-`/modules/<spec>` ESM bundle.
 *
 * The shim has two shapes, chosen by what the underlying source looks
 * like:
 *
 *   - **CJS source** (`react/index.js` itself, or any package whose
 *     `index.js` follows `module.exports = require('./cjs/...')`):
 *     the names returned by {@linkcode discoverCjsExports} become a
 *     destructure against the inner module's namespace after
 *     `commonjsPlugin` has rewritten the CJS surface into ESM. The
 *     shim forwards both the named bindings (so consumers can
 *     `import { useState } from "/@modules/react"`) and the default
 *     export (so consumers can `import * as React from "/@modules/react"`
 *     and read `React.useState`).
 *
 *   - **Real ESM packages** (`@mui/material/Button`,
 *     `@emotion/react`, etc.): `export * from "<abs>"; export {
 *     default } from "<abs>";` is enough — esbuild's built-in ESM
 *     handling forwards every named binding.
 *
 * Bundles for {@linkcode SHARED_REACT_SPECS} are built WITHOUT
 * externalising React — they're the source of truth. Bundles for
 * everything else externalise React via {@linkcode reactExternalPlugin}
 * so the browser resolves `react` against the shared `/@modules/react`
 * URL.
 */
async function bundledShim(
  handle: DenoPluginHandle,
  abs: string,
  spec: string,
): Promise<string> {
  const url = JSON.stringify(abs)
  const reexports = await discoverCjsExports(abs)
  const contents = reexports.length > 0
    ? `import * as ns from ${url};\nconst { ${reexports.join(', ')} } = ns;\nexport { ${
      reexports.join(', ')
    } };\nexport default ns;\n`
    : `export * from ${url};\nexport { default } from ${url};\n`
  const buildOpts: esbuild.BuildOptions = {
    stdin: {
      contents,
      resolveDir: abs.replace(/[^/\\]+$/, ''),
      sourcefile: '<module-shim>',
      loader: 'js',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    sourcemap: false,
    // The shim does NOT use `commonjsPlugin` here. The wrapper files
    // (e.g. `react/index.js`) include runtime-only constructs like
    // `process.env.NODE_ENV` that the browser can't evaluate. esbuild's
    // built-in CJS-to-ESM bridge handles `module.exports = require('./cjs/foo')`
    // chains by inlining the inner bundle and exposing its named
    // exports on the wrapper's namespace — which is what makes
    // `const { X } = ns` resolve correctly in the destructure shim.
    plugins: [reactExternalPlugin(spec), handle.plugin],
  }
  if (!isSharedReactSpec(spec)) {
    buildOpts.external = [...SHARED_REACT_SPECS]
  }
  const result = await esbuild.build(buildOpts)
  return result.outputFiles?.[0]?.text ?? ''
}

/**
 * Post-pass for CJS-bridged bundles. esbuild's CJS-to-ESM bridge leaves
 * internal `require("react")` calls as `__require("/@modules/react")` (or
 * `__require2(...)`, `__require3(...)`) when the specifier was externalised.
 * The browser has no `require`, so those calls would throw at runtime.
 *
 * The fix has two pieces:
 *
 *   1. Prepend `import * as __React0 from "/@modules/react";` so the
 *      bundle has a static reference to the shared module's namespace.
 *   2. Find each `__requireN("/@modules/react")` left in the bundle and
 *      replace it with `__React0` so the CJS-bridged code reads from the
 *      shared module's namespace import.
 *
 * After this pass, every CJS-bridged bundle has a static reference to
 * `/@modules/react`. The browser fetches that URL once and reuses it.
 *
 * The current bundle (`spec === 'react'`) doesn't need a prelude: it
 * is the source of truth and defines its own exports.
 */
function neutralizeDynamicReactRequires(
  source: string,
  currentSpec: string,
): string {
  if (currentSpec === 'react') return source
  const reactUrl = '/@modules/react'
  const prelude = `import * as __React0 from ${JSON.stringify(reactUrl)};\n`
  const escaped = reactUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `__require\\d*\\(\\s*(["'])${escaped}\\1\\s*\\)`,
    'g',
  )
  source = source.replace(pattern, '__React0')
  return prelude + source
}

export async function serveModule(
  handle: DenoPluginHandle,
  rawSpec: string,
  moduleUrlForAllowedSpec: (spec: string) => string | undefined,
): Promise<Response> {
  const spec = decodeURIComponent(rawSpec)
  if (!moduleUrlForAllowedSpec(spec)) {
    return new Response('forbidden', { status: 403 })
  }
  try {
    let resolved
    try {
      resolved = await handle.resolve(spec)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return new Response(
        `throw new Error(${JSON.stringify(`module resolve failed for ${spec}: ${message}`)});`,
        { headers: { 'content-type': JS_MIME } },
      )
    }
    const raw = await bundledShim(handle, resolved.absPath, spec)
    let code = await rewriteImports(raw, {
      specifier: spec,
      defaultJsxImportSource: 'react',
      jsxImportSourceModule: 'jsx-runtime',
      resolveBareSpecifier: moduleUrlForAllowedSpec,
      throwOnUnresolved: false,
    })
    code = neutralizeDynamicReactRequires(code, spec)
    return new Response(code, { headers: { 'content-type': JS_MIME } })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`module build failed for ${spec}: ${message}`)
    return new Response(
      `throw new Error(${JSON.stringify(`module build failed for ${spec}: ${message}`)});`,
      { headers: { 'content-type': JS_MIME } },
    )
  }
}
