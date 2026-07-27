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
 */
import type { DenoPluginHandle } from '@ggpwnkthx/esbuild-plugin-deno'
import { JS_MIME, type Route, Router, shouldTranspile } from '@ggpwnkthx/esbuild-wrapper-shared'
import * as path from '@std/path/posix'
import { loadPlugin } from './server/plugin.ts'
import { serveModule } from './server/serve_module.ts'
import { failureBody, type TransformedModule, transformLocal } from './server/serve_transform.ts'
import { serveStatic } from './server/serve_static.ts'
import { joinSrc, joinTests, SRC, stripLeadingSlashes, TESTS, within } from './server/paths.ts'

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
      return await serveModule(handle, rawSpec)
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
        const { code }: TransformedModule = await transformLocal(candidate, found.rel)
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
