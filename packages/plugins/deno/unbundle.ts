import * as esbuild from 'esbuild'
import * as path from '@std/path'
import { MediaType, Workspace, type WorkspaceOptions } from '@deno/loader'
import { walkGraph } from './graph.ts'
import { assetOutputName, isAssetMediaType, isPassthroughMediaType } from './assets.ts'
import { rewriteImports } from './rewrite.ts'
import { relativePathFor } from './path.ts'

/**
 * Inputs for {@link unbundle}. Resolved URLs from `@deno/loader` are written
 * one per file into `outdir`; every import that resolves to a module in the
 * graph is rewritten to a relative path that points at the emitted sibling.
 */
export interface UnbundleOptions {
  /** Entry-point URLs (`"npm:react"`, `"./main.ts"`, `jsr:@hono/hono@4/jsx/dom`). */
  entryPoints: string[]
  /** Output directory. Created if it does not exist. */
  outdir: string
  /** Path to a `deno.json(c)` to drive the loader. Auto-discovered if omitted. */
  configPath?: string
  /** Skip Deno's transpile step before emission. */
  noTranspile?: boolean
  /** `transform` → JSX → `_jsx`; `preserve` → JSX verbatim. Defaults to `transform`. */
  jsx?: 'transform' | 'preserve'
  /** Forwarded to esbuild when `jsx === 'transform'`. */
  jsxImportSource?: string
  /** Forwarded to esbuild when `jsx === 'transform'`. */
  jsxFactory?: string
  /** Forwarded to esbuild when `jsx === 'transform'`. */
  jsxFragment?: string
  /** Prefix for env vars to inline at build time. */
  publicEnvVarPrefix?: string
  /** esbuild build target. Defaults to `es2022`. */
  target?: esbuild.BuildOptions['target']
  /** Print resolution/load decisions to stderr. */
  debug?: boolean
}

/**
 * Result of an unbundled emit: the absolute paths of every file written,
 * plus the subset that correspond to entry points (one path per entry in
 * the same order as `entryPoints`).
 */
export interface UnbundleResult {
  files: string[]
  entryFiles: string[]
}

/**
 * Walk the Deno-style graph rooted at `entryPoints`, transpile every module
 * to ESM via `@deno/loader`, and emit one file per module under `outdir` with
 * imports rewritten to point at emitted siblings.
 *
 * Binary assets (CSS, images, wasm, etc.) are copied verbatim with their
 * original extension preserved.
 */
export async function unbundle(opts: UnbundleOptions): Promise<UnbundleResult> {
  const workspaceOptions: WorkspaceOptions = {}
  if (opts.configPath) workspaceOptions.configPath = opts.configPath
  if (opts.noTranspile) workspaceOptions.noTranspile = opts.noTranspile
  if (opts.debug) workspaceOptions.debug = opts.debug
  if (opts.jsx === 'preserve') workspaceOptions.preserveJsx = true

  const workspace = new Workspace(workspaceOptions)
  const loader = await workspace.createLoader()
  try {
    const graph = await walkGraph(
      loader,
      opts.entryPoints,
      {
        ...(opts.jsxImportSource !== undefined
          ? { defaultJsxImportSource: opts.jsxImportSource }
          : {}),
      },
    )

    // Compute the path map (URL → relative output path).
    const pathMap = new Map<string, string>()
    for (const url of graph.keys()) {
      pathMap.set(url, relativePathFor(url))
    }

    const files: string[] = []
    const entryFiles: string[] = []
    const entryUrlSet = new Set<string>()

    // Resolve the entrypoint URLs up-front so we can record entryFiles.
    for (const entry of opts.entryPoints) {
      try {
        const url = loader.resolveSync(entry, undefined, 0)
        if (graph.has(url)) entryUrlSet.add(url)
      } catch {
        // Unresolvable entry; reported by walkGraph as a module error.
      }
    }

    await Deno.mkdir(opts.outdir, { recursive: true })

    for (const [url, mod] of graph) {
      const rel = pathMap.get(url)!
      const abs = path.join(opts.outdir, rel)
      await Deno.mkdir(path.dirname(abs), { recursive: true })

      if (isAssetMediaType(mod.mediaType)) {
        // Binary asset — copy verbatim.
        const outRel = assetOutputName(url, rel)
        const outAbs = path.join(opts.outdir, outRel)
        await Deno.writeFile(outAbs, mod.code)
        files.push(outAbs)
        if (entryUrlSet.has(url)) entryFiles.push(outAbs)
        // Update pathMap so JS-side imports rewrite to the asset's actual path.
        if (outRel !== rel) pathMap.set(url, outRel)
        continue
      }

      if (isPassthroughMediaType(mod.mediaType)) {
        // CSS/HTML/SQL — copy verbatim with the right extension.
        const outRel = assetOutputName(url, rel)
        const outAbs = path.join(opts.outdir, outRel)
        await Deno.writeFile(outAbs, mod.code)
        files.push(outAbs)
        if (entryUrlSet.has(url)) entryFiles.push(outAbs)
        if (outRel !== rel) pathMap.set(url, outRel)
        continue
      }

      if (mod.mediaType === MediaType.Json) {
        await Deno.writeFile(abs, mod.code)
        files.push(abs)
        if (entryUrlSet.has(url)) entryFiles.push(abs)
        continue
      }

      // JS / TS / JSX / TSX / CJS — transpile via esbuild and rewrite imports.
      const rewritten = await rewriteImports(
        url,
        mod.code,
        mod.mediaType,
        rel,
        mod.dependencies,
        pathMap,
        {
          jsx: opts.jsx ?? 'transform',
          ...(opts.jsxImportSource !== undefined ? { jsxImportSource: opts.jsxImportSource } : {}),
          ...(opts.jsxFactory !== undefined ? { jsxFactory: opts.jsxFactory } : {}),
          ...(opts.jsxFragment !== undefined ? { jsxFragment: opts.jsxFragment } : {}),
          ...(opts.target !== undefined ? { target: opts.target } : {}),
          ...(opts.publicEnvVarPrefix !== undefined
            ? { publicEnvVarPrefix: opts.publicEnvVarPrefix }
            : {}),
        },
      )
      await Deno.writeFile(abs, rewritten)
      files.push(abs)
      if (entryUrlSet.has(url)) entryFiles.push(abs)
    }

    return { files, entryFiles }
  } finally {
    loader[Symbol.dispose]?.()
  }
}
