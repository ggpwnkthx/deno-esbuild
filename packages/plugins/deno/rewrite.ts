import * as esbuild from 'esbuild'
import { MediaType } from '@deno/loader'
import { mediaToLoader } from './utils.ts'
import { relativeImport } from './path.ts'
import type { UnbundledModuleDependency } from './graph.ts'

/**
 * Options controlling how `rewriteImports` produces transpiled, import-rewritten
 * ESM source for a single module.
 */
export interface RewriteOptions {
  /** `'transform'` → JSX → `_jsx`/`_jsxs` calls; `'preserve'` → JSX verbatim. */
  jsx: 'transform' | 'preserve'
  /** Forwarded to esbuild when `jsx === 'transform'`. */
  jsxImportSource?: string
  /** Forwarded to esbuild when `jsx === 'transform'`. */
  jsxFactory?: string
  /** Forwarded to esbuild when `jsx === 'transform'`. */
  jsxFragment?: string
  /** esbuild build target. Defaults to `es2022`. */
  target?: esbuild.BuildOptions['target']
  /** Prefix used for `publicEnvVarPrefix`-style env-var inlining. */
  publicEnvVarPrefix?: string
}

/**
 * Transpile a single loaded module's source bytes to ESM (CJS → ESM, TS/JSX
 * stripped, JSX optionally preserved or transformed), then rewrite every
 * import/export-from/dynamic-import specifier whose target lives in `pathMap`
 * so the result references the emitted sibling files.
 *
 * `dependencies` carries the original specifier text per child (from the
 * @deno/graph walk). For each entry whose URL appears in `pathMap` we splice
 * the original source text *before* handing it to esbuild, so we never depend
 * on esbuild's metafile (the wrapper strips `metafile` from `TransformResult`).
 */
export async function rewriteImports(
  url: string,
  code: Uint8Array,
  mediaType: MediaType,
  fromRelative: string,
  dependencies: ReadonlyArray<UnbundledModuleDependency>,
  pathMap: ReadonlyMap<string, string>,
  opts: RewriteOptions,
): Promise<Uint8Array> {
  // Step 1: rewrite imports in the original source. Splice before transpile
  // so we don't need esbuild's metafile.
  let text = new TextDecoder().decode(code)
  text = rewriteInSource(text, dependencies, pathMap, fromRelative)

  // Step 2: optional env-var inlining on the (rewritten, pre-transpile) source.
  if (opts.publicEnvVarPrefix && opts.publicEnvVarPrefix.length > 0) {
    text = inlinePublicEnvVars(text, opts.publicEnvVarPrefix)
  }

  // Step 3: transpile to ESM via esbuild.
  const loader = mediaToLoader(mediaType)
  const isJsxPragma = loader === 'jsx' || loader === 'tsx'

  const transformOpts: esbuild.TransformOptions = {
    loader,
    format: 'esm',
    target: opts.target ?? 'es2022',
    sourcefile: url,
    ...(isJsxPragma && opts.jsx === 'preserve' ? { jsx: 'preserve' as const } : {}),
    ...(isJsxPragma && opts.jsx === 'transform'
      ? {
        jsx: 'automatic' as const,
        ...(opts.jsxImportSource ? { jsxImportSource: opts.jsxImportSource } : {}),
        ...(opts.jsxFactory ? { jsxFactory: opts.jsxFactory } : {}),
        ...(opts.jsxFragment ? { jsxFragment: opts.jsxFragment } : {}),
      }
      : {}),
  }

  const result = await esbuild.transform(text, transformOpts)
  return encode(result.code ?? text)
}

/**
 * Rewrite every `from "<spec>"` and `import("<spec>")` occurrence in `source`
 * where `<spec>` equals a known dependency's originalSpec, replacing it with
 * the relative path from `fromRelative` to the dependency's emitted file.
 */
function rewriteInSource(
  source: string,
  dependencies: ReadonlyArray<UnbundledModuleDependency>,
  pathMap: ReadonlyMap<string, string>,
  fromRelative: string,
): string {
  const rewrites = new Map<string, string>()
  for (const dep of dependencies) {
    const target = pathMap.get(dep.url)
    if (!target) continue
    rewrites.set(dep.originalSpec, relativeImport(fromRelative, target))
  }
  if (rewrites.size === 0) return source

  return source.replace(
    /(\bfrom\s*|\bimport\s*\(\s*)(["'])([^"']+)\2/g,
    (_m, prefix: string, quote: string, spec: string) => {
      const target = rewrites.get(spec)
      if (!target) return _m
      return prefix + quote + target + quote
    },
  )
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

/**
 * Port of the bundled `publicEnvVarPrefix` substitution from `mod.ts`, applied
 * to a single ESM source string.
 */
function inlinePublicEnvVars(code: string, envPrefix: string): string {
  let out = code.replaceAll(
    /Deno\.env\.get\(["']([^)]+)['"]\)|process\.env\.([\w_-]+)|import\.meta\.env\.([\w_]+)/g,
    (m, name, processName, importMetaName) => {
      if (name !== undefined && name.startsWith(envPrefix)) {
        return literal(Deno.env.get(name) ?? null)
      }
      if (processName !== undefined && processName.startsWith(envPrefix)) {
        return literal(Deno.env.get(processName) ?? null)
      }
      if (
        importMetaName !== undefined && importMetaName.startsWith(envPrefix)
      ) {
        return literal(Deno.env.get(importMetaName) ?? null)
      }
      return m
    },
  )

  out = out.replaceAll(
    /const\s+\{\s*([\w_]+(?:\s*,\s*[\w_]+)*)\s*\}\s*=\s*Deno\.env/g,
    (match: string, identList: string) => {
      const ids = identList.split(',').map((s: string) => s.trim())
      const allMatch = ids.every((id: string) => id.startsWith(envPrefix))
      if (!allMatch) return match
      const inlined = ids.map((id: string) => {
        const v = Deno.env.get(id) ?? null
        return `${id} = ${literal(v)}`
      })
      return `const { ${inlined.join(', ')} } = Deno.env`
    },
  )
  return out
}

function literal(v: string | null): string {
  const s = JSON.stringify(v)
  return s === 'null' ? `"null"` : s
}
