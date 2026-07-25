import { createGraph } from '@deno/graph'
import { type Loader, MediaType, RequestedModuleType, ResolutionMode } from '@deno/loader'

/**
 * A single module in the unbundled graph: its resolved URL, transpiled source,
 * media type, and the resolved URLs of its code dependencies (in source order).
 */
export interface UnbundledModuleDependency {
  /** The fully resolved URL of the dependency (key in the graph map). */
  url: string
  /** The original specifier text as it appeared in the source (e.g. `"react"`, `"npm:react"`). */
  originalSpec: string
}

export interface UnbundledModule {
  /** Fully resolved URL of the module (e.g. `npm:/react@18.2.0/index.js`). */
  specifier: string
  /** Media type from `@deno/loader` for the post-transpile content. */
  mediaType: MediaType
  /** Transpiled source bytes (UTF-8 text encoded as Uint8Array). */
  code: Uint8Array
  /** Resolved URLs of code dependencies, in source order. */
  dependencies: UnbundledModuleDependency[]
}

/**
 * Walk the Deno-style module graph rooted at the given entrypoints, returning
 * every module that participates in the graph. Resolution is delegated to
 * `@deno/loader` so Deno's import map, npm:/jsr:/http(s): semantics, and
 * transpilation all behave natively; `@deno/graph` is used purely to enumerate
 * the dependency edges (including conditional exports, dynamic imports, and
 * package.json `exports` branches).
 *
 * The returned map preserves insertion order: the first key is the first
 * entrypoint's resolved URL; dependencies follow in DFS order.
 */
export async function walkGraph(
  loader: Loader,
  entrypoints: string[],
  options: { defaultJsxImportSource?: string } = {},
): Promise<Map<string, UnbundledModule>> {
  // @deno/graph requires fully-qualified URLs as roots. Resolve each entry
  // through @deno/loader so relative paths like "./main.ts" become file:// URLs.
  const resolvedRoots = entrypoints.map((entry) => {
    try {
      return loader.resolveSync(entry, undefined, ResolutionMode.Import)
    } catch {
      return entry
    }
  })

  // Trigger @deno/loader's lazy download/cache for every entrypoint up-front.
  const entryDiagnostics = await loader.addEntrypoints(resolvedRoots)
  for (const d of entryDiagnostics) {
    // Surface only blocking diagnostics; warning kinds are not fatal.
    if ((d as { code?: string }).code === 'ResolverError') {
      throw new Error(d.message)
    }
  }

  const graph = await createGraph(resolvedRoots, {
    ...(options.defaultJsxImportSource !== undefined
      ? { defaultJsxImportSource: options.defaultJsxImportSource }
      : {}),
    resolve: (specifier: string, referrer: string) => {
      try {
        const ref = referrer === '' ? undefined : referrer
        return loader.resolveSync(specifier, ref, ResolutionMode.Import)
      } catch {
        // Already-resolved URL pass-through (e.g. `?url`, `?raw`, `?worker`).
        if (/^[a-z][a-z0-9+.-]*:/i.test(specifier)) return specifier
        throw new Error(`Unable to resolve ${specifier} from ${referrer}`)
      }
    },
    load: async (specifier: string) => {
      let url = specifier
      if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(specifier)) {
        try {
          url = loader.resolveSync(specifier, undefined, ResolutionMode.Import)
        } catch {
          return undefined
        }
      }
      try {
        const res = await loader.load(url, RequestedModuleType.Default)
        if (res.kind === 'module') {
          return {
            kind: 'module' as const,
            specifier: res.specifier,
            content: res.code,
          }
        }
        return {
          kind: 'external' as const,
          specifier: res.specifier,
        }
      } catch {
        return undefined
      }
    },
  })

  const seen = new Set<string>()
  const out = new Map<string, UnbundledModule>()

  for (const mod of graph.modules) {
    if (mod.error) {
      throw new Error(`Module graph error for ${mod.specifier}: ${mod.error}`)
    }
    // Skip built-ins (`external`) and modules that have no executable kind.
    if (mod.kind === 'external') continue
    const deps: Array<{ url: string; originalSpec: string }> = []
    for (const dep of mod.dependencies ?? []) {
      const resolved = dep.code?.specifier
      if (resolved) deps.push({ url: resolved, originalSpec: dep.specifier })
    }
    // Load the transpiled bytes once via @deno/loader so emit gets
    // post-transpile content + the authoritative MediaType.
    const loaded = await loader.load(mod.specifier, RequestedModuleType.Default)
    if (loaded.kind !== 'module') continue
    if (seen.has(loaded.specifier)) continue
    seen.add(loaded.specifier)
    out.set(loaded.specifier, {
      specifier: loaded.specifier,
      mediaType: loaded.mediaType,
      code: loaded.code,
      dependencies: deps,
    })
  }

  return out
}
