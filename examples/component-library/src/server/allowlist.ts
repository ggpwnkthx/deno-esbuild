/**
 * Allowlist of npm/JS module specifiers the dev server is willing to bundle on
 * demand for the `/@modules/<spec>` route. Bare specifiers only; `npm:`,
 * `jsr:`, `http(s):`, and relative paths are rejected.
 */
const ALLOWED_SPECS = new Set([
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
])

const SPEC_PATTERN = /^[A-Za-z][A-Za-z0-9_/.-]*$/

export function isAllowedModuleSpec(rawSpec: string): boolean {
  const spec = decodeURIComponent(rawSpec)
  if (!SPEC_PATTERN.test(spec)) return false
  return ALLOWED_SPECS.has(spec)
}

/**
 * URL the dev server serves the given allowlisted spec under. Returns
 * `undefined` when the spec is not allowlisted so callers can distinguish
 * between "rewrite" and "leave alone or error".
 */
export function moduleUrlForAllowedSpec(spec: string): string | undefined {
  if (!ALLOWED_SPECS.has(spec)) return undefined
  return `/@modules/${spec}`
}
