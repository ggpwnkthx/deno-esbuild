/**
 * AST-based import rewriter.
 *
 * Parses a JS/TS source string with `@deno/graph`'s {@linkcode parseModule},
 * locates the character spans of bare-specifier imports (e.g. `import x from
 * "react"`), and splices them back in by absolute character offset with
 * caller-supplied replacement URLs.
 *
 * Why AST and not regex: bare specifiers can appear inside template literals,
 * comments, or computed property keys — a string-based search would either
 * miss or mis-locate them. The AST exposes the source-span of each import
 * expression's specifier directly.
 *
 * Why callback-based: the example wires this against an allowlist of npm
 * packages mapped to `/@modules/<spec>` URLs, but a Hono or Oak consumer
 * might want a different mapping (a real CDN, a local proxy, an import map
 * server, etc.). The rewriter stays framework-agnostic by letting callers
 * pass in any `(spec) => url | undefined` resolver.
 *
 * @example
 * ```ts
 * import { rewriteImports } from "@ggpwnkthx/esbuild-wrapper-shared";
 *
 * const allowlist = new Map([["react", "/@modules/react"]]);
 *
 * const source = `import * as React from "react";`;
 * const out = await rewriteImports(source, {
 *   specifier: "main.tsx",
 *   defaultJsxImportSource: "react",
 *   resolveBareSpecifier: (spec) => allowlist.get(spec),
 * });
 * // out: `import * as React from "/@modules/react";`
 * ```
 */
import { parseModule } from '@deno/graph'

/** Options accepted by {@linkcode rewriteImports}. */
export interface RewriteOptions {
  /**
   * Resolve a bare specifier (e.g. `"react"`, `"react-dom/client"`) to the
   * URL it should be rewritten to. Return `undefined` to leave the specifier
   * unchanged; when {@linkcode RewriteOptions.throwOnUnresolved} is `true`
   * (default) the call throws instead.
   */
  resolveBareSpecifier?: (spec: string) => string | undefined

  /**
   * When `true` (default), bare specifiers whose
   * {@linkcode RewriteOptions.resolveBareSpecifier} returns `undefined`
   * cause a thrown `Error` so callers can surface the failure loudly. Set
   * to `false` to silently leave unmatched specifiers in place.
   */
  throwOnUnresolved?: boolean

  /**
   * Module specifier attached to the parsed module. Only used in error
   * messages and to work around a `@deno/graph@^0.110.2` quirk where
   * `.tsx`/`.ts` specifiers produce zero-width AST spans.
   */
  specifier?: string

  /**
   * Default JSX import source passed to `parseModule`. Defaults to
   * `"react"` for backwards compatibility with the demo dev server; pass
   * `undefined` to disable the hint.
   */
  defaultJsxImportSource?: string

  /**
   * JSX import source module passed to `parseModule`. Defaults to
   * `"jsx-runtime"`.
   */
  jsxImportSourceModule?: string

  /**
   * When `true`, errors thrown during rewriting are caught and converted
   * to a JS `throw new Error("rewrite failed for <specifier>: <message>");`
   * body string instead of propagating. The error is also logged via
   * `console.warn` with the same text. Useful for browser-facing dev
   * servers that want to surface a loud failure inline as an executable
   * module body rather than as a server-side 5xx.
   *
   * The body text uses {@linkcode RewriteOptions.specifier} (or the literal
   * `"<rewriter-input>"` when no specifier was supplied) as the file
   * identifier in the message. Callers that want a different prefix (e.g.
   * "transform failed for ...") should compose this with their own
   * try/catch at the call site.
   *
   * @default false
   */
  failAsErrorBody?: boolean
}

interface Span {
  start: number
  end: number
}

interface Edit {
  span: Span
  replacement: string
}

interface DepLike {
  specifier?: unknown
  code?: { span?: RangeLike | undefined }
  type?: { span?: RangeLike | undefined }
}

interface RangeLike {
  start: { line: number; character: number }
  end: { line: number; character: number }
}

interface ParsedModuleLike {
  dependencies?: ReadonlyArray<DepLike>
}

function lineStarts(source: string): number[] {
  const starts: number[] = [0]
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) starts.push(i + 1)
  }
  return starts
}

function spanFromRange(range: RangeLike, lineOffsets: number[]): Span {
  const startLineOffset = lineOffsets[range.start.line] ?? lineOffsets.at(-1) ?? 0
  const endLineOffset = lineOffsets[range.end.line] ?? lineOffsets.at(-1) ?? 0
  return {
    start: startLineOffset + range.start.character,
    end: endLineOffset + range.end.character,
  }
}

function applyEdits(source: string, edits: Edit[]): string {
  if (edits.length === 0) return source
  const sorted = [...edits].sort((a, b) => b.span.start - a.span.start)
  let out = source
  for (const edit of sorted) {
    out = out.slice(0, edit.span.start) + edit.replacement + out.slice(edit.span.end)
  }
  return out
}

function isBareSpec(spec: string): boolean {
  if (spec.length === 0) return false
  if (spec.includes(':')) return false
  if (spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/')) return false
  return /^[A-Za-z]/.test(spec)
}

function spansAreZeroWidth(deps: ReadonlyArray<DepLike>): boolean {
  if (deps.length === 0) return false
  return deps.every((d) => {
    const span = d.code?.span ?? d.type?.span
    return !span ||
      (span.start.line === 0 && span.start.character === 0 && span.end.line === 0 &&
        span.end.character === 0)
  })
}

/**
 * Parse `source` and return an edited copy with bare-specifier imports
 * rewritten via the caller-supplied {@linkcode RewriteOptions.resolveBareSpecifier}.
 *
 * Non-allowlisted bare specifiers throw when `throwOnUnresolved` is `true`
 * (the default). Relative imports, URL-scheme specifiers (`npm:`, `jsr:`,
 * `http:`), and template-literal occurrences are left untouched.
 *
 * Returns the original string unchanged when no edits apply or when
 * `source` is empty. When `failAsErrorBody` is set, errors thrown during
 * rewriting are caught and converted into a JS `throw new Error(...)` body
 * string instead of propagating.
 */
export async function rewriteImports(
  source: string,
  options: RewriteOptions = {},
): Promise<string> {
  try {
    return await rewriteImportsInner(source, options)
  } catch (err) {
    if (options.failAsErrorBody) {
      const identifier = options.specifier ?? '<rewriter-input>'
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`rewrite failed for ${identifier}: ${message}`)
      return `throw new Error(${JSON.stringify(`rewrite failed for ${identifier}: ${message}`)});`
    }
    throw err
  }
}

async function rewriteImportsInner(
  source: string,
  options: RewriteOptions,
): Promise<string> {
  if (source.length === 0) return source
  const lineOffsets = lineStarts(source)
  const input = options.specifier ?? 'rewriter-input.js'
  const safeSpecifier = input.endsWith('.tsx') || input.endsWith('.ts')
    ? input.replace(/\.tsx?$/, '.js')
    : input
  const specifier = `file:///${safeSpecifier.replace(/^\/+/, '')}`
  const parseOptions: {
    defaultJsxImportSource?: string
    jsxImportSourceModule: string
  } = {
    jsxImportSourceModule: options.jsxImportSourceModule ?? 'jsx-runtime',
  }
  if (options.defaultJsxImportSource !== undefined) {
    parseOptions.defaultJsxImportSource = options.defaultJsxImportSource
  }
  let module: ParsedModuleLike = await parseModule(
    specifier,
    new TextEncoder().encode(source),
    parseOptions,
  )
  let deps: ReadonlyArray<DepLike> = module.dependencies ?? []
  if (spansAreZeroWidth(deps)) {
    // Workaround: `@deno/graph@^0.110.2` returns zero-width spans when
    // the specifier ends in `.tsx`. Force a `.js` extension so span
    // positions are populated correctly on the second pass.
    module = await parseModule(
      specifier,
      new TextEncoder().encode(source),
      parseOptions,
    )
    deps = module.dependencies ?? []
  }
  const throwOnUnresolved = options.throwOnUnresolved ?? true
  const resolve = options.resolveBareSpecifier
  const edits: Edit[] = []
  for (const dep of deps) {
    const spec = dep.specifier
    if (typeof spec !== 'string') continue
    if (!isBareSpec(spec)) continue
    const replacementUrl = resolve ? resolve(spec) : undefined
    if (replacementUrl === undefined) {
      if (throwOnUnresolved) {
        throw new Error(`bare specifier "${spec}" was not resolved`)
      }
      continue
    }
    const span = dep.code?.span ?? dep.type?.span
    if (!span) continue
    const absoluteSpan = spanFromRange(span, lineOffsets)
    const original = source.slice(absoluteSpan.start, absoluteSpan.end)
    const quote = original[0]
    if (quote !== '"' && quote !== "'") {
      continue
    }
    edits.push({
      span: absoluteSpan,
      replacement: `${quote}${replacementUrl}${quote}`,
    })
  }
  return applyEdits(source, edits)
}
