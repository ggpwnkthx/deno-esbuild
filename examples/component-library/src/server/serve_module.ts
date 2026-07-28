import type { DenoPluginHandle } from '@ggpwnkthx/esbuild-plugin-deno'
import * as esbuild from '@ggpwnkthx/esbuild'
import { JS_MIME, rewriteImports } from '@ggpwnkthx/esbuild-wrapper-shared'

/**
 * Specs whose npm package ships only CommonJS sources and exposes no static
 * export list. For these we hand-maintain the re-exports we need at runtime;
 * `export * from "<abs>"` doesn't work because esbuild cannot see the named
 * exports of a CJS module statically (it falls back to forwarding only the
 * default export). Everything else (ESM packages like `@mui/material`,
 * `@emotion/*`, etc.) goes through the generic shim below.
 *
 * The {@linkcode react} entry is intentionally exhaustive so MUI and
 * `react-dom` can reach every React hook/component helper they reference.
 */
const CJS_REEXPORT_TABLE: Record<string, readonly string[]> = {
  'react': [
    'Children',
    'Component',
    'Fragment',
    'Profiler',
    'PureComponent',
    'StrictMode',
    'Suspense',
    '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED',
    'act',
    'cloneElement',
    'createContext',
    'createElement',
    'createFactory',
    'createRef',
    'forwardRef',
    'isValidElement',
    'lazy',
    'memo',
    'startTransition',
    'unstable_act',
    'useCallback',
    'useContext',
    'useDebugValue',
    'useDeferredValue',
    'useEffect',
    'useId',
    'useImperativeHandle',
    'useInsertionEffect',
    'useLayoutEffect',
    'useMemo',
    'useReducer',
    'useRef',
    'useState',
    'useSyncExternalStore',
    'useTransition',
    'version',
  ],
  'react-dom': ['createPortal', 'flushSync', 'unstable_batchedUpdates'],
  'react-dom/client': ['createRoot', 'hydrateRoot'],
  'react/jsx-runtime': ['jsx', 'jsxs', 'Fragment'],
  'react/jsx-dev-runtime': ['jsxDEV', 'jsx', 'jsxs', 'Fragment'],
} as const

function _isCjsReexportSpec(spec: string): boolean {
  return Object.prototype.hasOwnProperty.call(CJS_REEXPORT_TABLE, spec)
}

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
 * Build the per-`/modules/<spec>` ESM bundle. CJS-only specs use the
 * hand-maintained {@linkcode CJS_REEXPORT_TABLE} destructure, which esbuild
 * can statically forward as named exports. ESM packages use
 * `export * from "<abs>"; export { default } from "<abs>";`, which esbuild's
 * CJS-to-ESM bridge handles cleanly when the target module is real ESM.
 *
 * Bundles for {@linkcode SHARED_REACT_SPECS} are built WITHOUT externalising
 * React — they're the source of truth. Bundles for everything else
 * externalise React via {@linkcode reactExternalPlugin} so the browser
 * resolves `react` against the shared `/@modules/react` URL.
 */
async function bundledShim(
  handle: DenoPluginHandle,
  abs: string,
  spec: string,
): Promise<string> {
  const url = JSON.stringify(abs)
  const reexports = CJS_REEXPORT_TABLE[spec]
  const contents = reexports
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
