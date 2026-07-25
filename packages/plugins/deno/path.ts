import * as path from '@std/path'
import * as posix from '@std/path/posix'

/**
 * Map a fully-resolved module URL to a deterministic path inside `outdir`.
 *
 * The mapping is deliberately verbose (e.g. `npm__react@18.2.0/index.js`) so a
 * human can trace any emitted file back to the specifier that produced it,
 * and so collisions across different npm/jsr packages are impossible without
 * colliding scope/name/version segments.
 *
 * Examples:
 *   npm:react@18.2.0                       → npm__react@18.2.0/index.js
 *   npm:react@18.2.0/jsx-runtime           → npm__react@18.2.0/jsx-runtime.js
 *   jsr:@hono/hono@4.12.32/jsx/dom         → jsr__@hono__hono@4.12.32/jsx/dom.js
 *   file:///abs/path/src/main.ts            → src/main.js (rooted at outbase)
 *   https://example.com/mod.ts              → https__example.com/mod.js
 */
export function relativePathFor(specifier: string, outbase?: string): string {
  const cleaned = stripQuery(specifier)
  if (cleaned.startsWith('npm:')) return mapNpm(cleaned.slice(4))
  if (cleaned.startsWith('jsr:')) return mapJsr(cleaned.slice(4))
  if (cleaned.startsWith('file://')) return mapFile(cleaned, outbase)
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    return mapHttp(cleaned)
  }
  return sanitize(cleaned.replace(/:/g, '__')) + '.js'
}

function stripQuery(url: string): string {
  const q = url.indexOf('?')
  return q === -1 ? url : url.slice(0, q)
}

function mapNpm(spec: string): string {
  const slash = spec.indexOf('/')
  const nameVer = slash === -1 ? spec : spec.slice(0, slash)
  const subpath = slash === -1 ? '' : spec.slice(slash)
  return `npm__${sanitize(nameVer)}${mapSubpath(subpath)}`
}

function mapJsr(spec: string): string {
  const slash = spec.indexOf('/')
  const nameVer = slash === -1 ? spec : spec.slice(0, slash)
  const subpath = slash === -1 ? '' : spec.slice(slash)
  return `jsr__${sanitize(nameVer)}${mapSubpath(subpath)}`
}

function mapSubpath(subpath: string): string {
  if (!subpath) return '/index.js'
  const stripped = subpath.replace(
    /\.(tsx?|jsx?|mjs|cjs|json|wasm)$/i,
    '',
  )
  return stripped + '.js'
}

function mapFile(url: string, outbase?: string): string {
  let p: string
  try {
    p = path.fromFileUrl(url)
  } catch {
    return sanitize(url.replace(/^file:\/\//, '')) + '.js'
  }
  // Deno's npm cache layout: <deno_dir>/node_modules/.deno/<name>@<ver>/node_modules/<name>/...
  // We rebuild the npm: specifier from that layout so the emitted tree mirrors
  // the npm: namespace exactly.
  const npmMatch = p.match(
    /\/node_modules\/\.deno\/((?:@[^/]+\/)?[^@/]+)@([^\/]+)\/node_modules\/((?:@[^/]+\/)?[^/]+)\/(.*)$/,
  )
  if (npmMatch) {
    const [, , version, name, rest] = npmMatch
    const fullName = name // includes scope if present
    const subpath = rest ? '/' + rest.replace(/\.(tsx?|jsx?|mjs|cjs|json|wasm)$/i, '') : ''
    return `npm__${sanitize(fullName + '@' + version)}${subpath}.js`
  }
  if (outbase && (p === outbase || p.startsWith(outbase + '/'))) {
    p = p.slice(outbase.length).replace(/^[\\/]+/, '')
  }
  if (!p) p = 'index'
  const ext = path.extname(p)
  const base = ext ? p.slice(0, -ext.length) : p
  return base + '.js'
}

function mapHttp(url: string): string {
  const u = new URL(url)
  // JSR registry: https://jsr.io/<scope>/<name>/<version>/<subpath>
  // Mirror as jsr:<scope>/<name>@<version>/<subpath>.
  if (u.host === 'jsr.io' && u.protocol === 'https:') {
    const segs = u.pathname.split('/').filter(Boolean)
    // Layout: ["@scope", "name", "version", "sub1", "sub2", "file.tsx"]
    if (segs.length >= 3) {
      const scope = segs[0]!.startsWith('@') ? segs[0] + '/' + segs[1] : segs[0]
      const version = segs[2]!
      const file = segs[segs.length - 1]!
      const subpathSegs = segs.slice(3, -1)
      const subpath = subpathSegs.length ? '/' + subpathSegs.join('/') : ''
      const cleanSub = subpath +
        (file.includes('.') ? '/' + file.replace(/\.(tsx?|jsx?|mjs|cjs|json|wasm)$/i, '') : '')
      return `jsr__${sanitize(scope + '@' + version)}${cleanSub}.js`
    }
  }
  let p = u.pathname === '/' ? '/index' : u.pathname
  const ext = path.extname(p)
  if (ext) p = p.slice(0, -ext.length)
  return `https__${u.host}${sanitize(p)}.js`
}

function sanitize(seg: string): string {
  return seg.replace(/[^A-Za-z0-9@._-]/g, '__')
}

/**
 * Resolve a relative path between two emitted files, using POSIX-style
 * separators so the result is identical on Windows and POSIX.
 */
export function relativeImport(fromFile: string, toFile: string): string {
  const fromDir = posix.dirname(fromFile)
  let rel = posix.relative(fromDir, toFile)
  if (!rel.startsWith('.') && !rel.startsWith('/')) rel = './' + rel
  return rel
}
