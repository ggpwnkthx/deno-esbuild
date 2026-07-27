/**
 * MIME type table and lookup used by dev-server routes that serve static
 * files alongside transpiled JS modules.
 *
 * Reuses a small inline `extname` helper so the package does not have to
 * depend on `@std/path` just to read a file extension.
 *
 * @example
 * ```ts
 * import { mimeFor, JS_MIME } from "@ggpwnkthx/esbuild-wrapper-shared";
 *
 * const response = new Response(fileBody, {
 *   headers: { "content-type": mimeFor("src/index.html") },
 * });
 * // JS_MIME: "application/javascript; charset=utf-8"
 * ```
 */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

/** Content-Type used for transpiled JS responses. */
export const JS_MIME = 'application/javascript; charset=utf-8'

/** Fallback content-type returned by {@linkcode mimeFor} for unknown extensions. */
export const DEFAULT_MIME = 'application/octet-stream'

/**
 * Return the file extension (including the leading `.`) of `path`, lowercased.
 * Accepts POSIX and Windows separators. Returns an empty string when the
 * filename has no extension or when the filename is a hidden file whose
 * only `.` is the leading one (e.g. `.gitignore`).
 */
function extname(path: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const filenameStart = slash === -1 ? 0 : slash + 1
  const lastDot = path.lastIndexOf('.')
  if (lastDot < filenameStart) return ''
  if (lastDot === filenameStart && path.charCodeAt(filenameStart) === 46 /* "." */) {
    return ''
  }
  return path.slice(lastDot).toLowerCase()
}

/**
 * Look up the MIME type for a file path by its lowercased extension.
 * Returns {@linkcode DEFAULT_MIME} when the extension is unknown.
 */
export function mimeFor(path: string): string {
  return MIME[extname(path)] ?? DEFAULT_MIME
}
