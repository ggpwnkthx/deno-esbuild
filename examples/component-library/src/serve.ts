/**
 * Runtime dev server for the demo. Routes:
 *   - `/` and `/index.html`           → src/index.html (verbatim)
 *   - `/@modules/<spec>`              → fully bundled npm/JS module returned
 *                                       by `handle.build(spec)` (allowed
 *                                       specs only; 403 otherwise)
 *   - `*.tsx` / `*.ts` under src/      → esbuild.transform per file (one
 *                                       browser-routable ESM module per file)
 *   - `*.tsx` / `*.ts` under tests/   → same transform, exposed for tests
 *   - everything else under src/      → static file response
 *   - else                             → 404
 *
 * The Deno plugin handle is created once at module load and shared across
 * requests so the workspace/loader doesn't get re-instantiated per call.
 *
 * Routing primitives (`Router`, `Route`, `shouldTranspile`) and the
 * `JS_MIME` constant come from `@ggpwnkthx/esbuild-wrapper-shared` so the
 * example stays in sync with the same abstractions exposed to Hono and
 * Oak consumers.
 *
 * Allowlist source: the `imports` map in this example's `deno.json`. Every
 * key is an allowed `/@modules/<spec>` target. The keys include the
 * subpath imports (`react/jsx-runtime`, `react/jsx-dev-runtime`,
 * `react-dom/client`) so esbuild's automatic JSX transform output
 * (`import { jsx } from "react/jsx-runtime"`) is rewritten to
 * `/@modules/react/jsx-runtime` by the same resolver that gates the route.
 */
import type { DenoPluginHandle } from '@ggpwnkthx/esbuild-plugin-deno'
import { JS_MIME, type Route, Router, shouldTranspile } from '@ggpwnkthx/esbuild-wrapper-shared'
import * as path from '@std/path/posix'
import { loadPlugin } from './server/plugin.ts'
import { serveModule } from './server/serve_module.ts'
import { failureBody, type TransformedModule, transformLocal } from './server/serve_transform.ts'
import { serveStatic } from './server/serve_static.ts'
import {
  DENO_CONFIG,
  joinSrc,
  joinTests,
  SRC,
  stripLeadingSlashes,
  TESTS,
  within,
} from './server/paths.ts'

// Derive the dev-server allowlist from this example's deno.json imports.
// Only keys whose value is an `npm:` URL are allowed; type packages
// (`@types/*`), dev tooling (`@astral/astral`, `@deno/graph`,
// `@ggpwnkthx/esbuild-wrapper-shared`, `@std/*`) live in the same `imports`
// map but resolve to a JSR URL the browser would not import, so they are
// filtered out to keep `/@modules/<spec>` from being a public CDN for the
// wrong audience.
const denoConfig = JSON.parse(await Deno.readTextFile(DENO_CONFIG)) as {
  imports?: Record<string, string>
}
const importMap = denoConfig.imports ?? {}
const allowedSpecs = new Set(
  Object.entries(importMap)
    .filter(([, value]) => typeof value === 'string' && value.startsWith('npm:'))
    .map(([key]) => key),
)

function moduleUrlForAllowedSpec(spec: string): string | undefined {
  return allowedSpecs.has(spec) ? `/@modules/${spec}` : undefined
}

function normalize(pathname: string): string {
  let p = decodeURIComponent(pathname)
  if (p === '' || p === '/') p = '/index.html'
  return p
}

function indexRoute(): Route {
  return {
    match: (_req, ctx) => ctx.pathname === '/index.html',
    handle: () => serveStatic(joinSrc('index.html')),
  }
}

function moduleRoute(handle: DenoPluginHandle): Route {
  return {
    match: (_req, ctx) => ctx.pathname.startsWith('/@modules/'),
    handle: async (_req, ctx) => {
      const rawSpec = ctx.pathname.slice('/@modules/'.length)
      return await serveModule(handle, rawSpec, moduleUrlForAllowedSpec)
    },
  }
}

function resolveLocal(abs: string): { ok: true; rel: string } | { ok: false } {
  if (within(SRC, abs)) {
    return { ok: true, rel: path.join('src', stripLeadingSlashes(abs.slice(SRC.length))) }
  }
  if (within(TESTS, abs)) {
    return {
      ok: true,
      rel: path.join('tests', stripLeadingSlashes(abs.slice(TESTS.length))),
    }
  }
  return { ok: false }
}
function transformRoute(): Route {
  return {
    match: (_req, ctx) => shouldTranspile(ctx.pathname),
    handle: async (_req, ctx) => {
      const pathname = stripLeadingSlashes(ctx.pathname)
      const segments = pathname.split('/').filter((seg) => seg.length > 0)
      const head = segments[0]
      const candidate = head === 'tests' ? joinTests(...segments.slice(1)) : joinSrc(...segments)
      const found = resolveLocal(candidate)
      if (!found.ok) return new Response('forbidden', { status: 403 })
      try {
        const { code }: TransformedModule = await transformLocal(
          candidate,
          found.rel,
          moduleUrlForAllowedSpec,
        )
        return new Response(code, { headers: { 'content-type': JS_MIME } })
      } catch (err) {
        console.warn(
          `transform failed for ${found.rel}: ${err instanceof Error ? err.message : String(err)}`,
        )
        return new Response(failureBody(found.rel, err), {
          headers: { 'content-type': JS_MIME },
        })
      }
    },
  }
}
function staticUnderRoute(): Route {
  return {
    match: (_req, ctx) => {
      const candidate = joinSrc(ctx.pathname)
      return within(SRC, candidate)
    },
    handle: (_req, ctx) => serveStatic(joinSrc(ctx.pathname)),
  }
}

const handle: DenoPluginHandle = await loadPlugin()

const router = new Router([
  indexRoute(),
  moduleRoute(handle),
  transformRoute(),
  staticUnderRoute(),
])

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    return await router.dispatch(req, { pathname: normalize(url.pathname) })
  },
  onListen(addr) {
    const { port } = addr as Deno.NetAddr
    console.log(
      `demo server listening on http://localhost:${port} (per-file ESM + bundled npm modules)`,
    )
  },
} satisfies Deno.ServeDefaultExport
