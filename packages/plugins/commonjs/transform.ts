/**
 * CJS-to-ESM transformer for `@ggpwnkthx/esbuild-plugin-commonjs`.
 *
 * Hand-rolled TypeScript implementation that parses CJS source as an
 * ESTree AST via `acorn`, walks the top-level statements, and rewrites
 * the recognised CJS shapes into the equivalent ESM. Code generation
 * goes through `astring`. No Babel runtime, no SWC binary — just two
 * small, fast, pure-JS npm packages that Deno loads via the `npm:`
 * specifier.
 *
 * Recognised patterns (the set React 19, React-DOM 19, and MUI 9 emit
 * at module top scope):
 *
 *   var X = require("spec")            →  import X from "spec"
 *   var { X, Y } = require("spec")    →  import { X as X, Y as Y } from "spec"
 *   require("spec")                    →  import "spec"     (side-effect)
 *   module.exports = X                  →  export default X
 *   module.exports = require("mod")     →  import * as _mod from "mod";
 *                                          export default _mod
 *   module.exports = { foo: 1 }         →  const foo = 1;
 *                                          export default { foo, bar }
 *   exports.X = Y                      →  const X = Y; export { X }
 *                                          (the last assignment to each
 *                                          name wins, matching the
 *                                          runtime `module.exports` shape)
 *
 * Anything not in the recognised set is left as-is. The plugin's
 * heuristic skips already-ESM files before the transform runs, so
 * the no-op path is fast.
 */

import { parse } from 'acorn'
import { generate } from 'astring'
import type {
  CallExpression,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  ExportSpecifier,
  Expression,
  ExpressionStatement,
  Identifier,
  ImportDeclaration,
  ImportDefaultSpecifier,
  ImportNamespaceSpecifier,
  ImportSpecifier,
  Literal,
  ModuleDeclaration,
  ObjectExpression,
  Program,
  Property,
  Statement,
  VariableDeclaration,
  VariableDeclarator,
} from 'acorn'

/** Options accepted by {@linkcode transform}. */
export interface TransformOptions {
  /** Path used for source map / error messages. */
  sourcefile?: string
  /** Whether to emit a source map. */
  sourcemap?: boolean
  /** Whether to include the original source in the source map. */
  sourcesContent?: boolean
  /**
   * Called when the transform sees a CJS export shape it can't
   * statically forward (computed keys, `Object.assign(exports, ...)`,
   * `exports = ...`, `module.exports = function/class/expr`). Use it
   * to log a one-shot warning to the operator — the resulting ESM
   * still emits, but some named exports may be missing.
   */
  onDynamicExport: ((message: string) => void) | undefined
}

/** Result of a {@linkcode transform} call. */
export interface TransformResult {
  code: string
  // deno-lint-ignore no-explicit-any
  map?: any
}

/**
 * Result of an {@linkcode extractCjsExports} scan: the names of the
 * statically-resolvable CJS named exports, plus a `dynamic` flag set
 * when the scan encountered a shape it couldn't resolve statically
 * (computed keys, `Object.assign(exports, ...)`, etc.).
 */
export interface CjsExportsScan {
  /** Names of statically-resolvable `exports.X = Y` assignments. */
  names: readonly string[]
  /** True if the scan encountered a shape it couldn't resolve. */
  dynamic: boolean
}

/**
 * Convert a CJS source string to ESM. Returns the transformed source
 * (and optionally a source map). Throws if the source can't be
 * parsed — callers should treat parse errors as "skip the transform"
 * and let esbuild's default CJS handler take over.
 */
export function transform(
  code: string,
  options: TransformOptions = { onDynamicExport: undefined },
): TransformResult {
  // Detect source type. ESM-style files (top-level `import` /
  // `export`) parse as `module`; the rest parses as `script`. CJS
  // files are typically `script`, but our `rewriteBody` produces an
  // ESM body which we re-emit with `sourceType: "module"`.
  const looksLikeEsm = /^\s*(?:import|export)\b/m.test(code)
  const ast = parse(code, {
    ecmaVersion: 'latest',
    sourceType: looksLikeEsm ? 'module' : 'script',
    allowReturnOutsideFunction: true,
    locations: !!options.sourcemap,
  }) as Program

  const ctx: RewriteContext = {
    importsByName: new Map<string, ImportDeclaration>(),
    namedExports: new Map<string, Expression>(),
    onDynamicExport: options.onDynamicExport,
  }
  const newBody: (Statement | ModuleDeclaration)[] = rewriteBody(ast.body, ctx)

  const newAst: Program = {
    ...ast,
    body: newBody,
    sourceType: 'module',
  }

  // deno-lint-ignore no-explicit-any
  const result: any = generate(newAst, {
    sourceMap: options.sourcemap,
  })

  // astring's `generate` returns a `string` by default and
  // `{ code, map }` when `sourceMap: true`. Normalise both shapes
  // to a single `TransformResult`.
  const isString = typeof result === 'string'
  const resultObj = isString ? null : (result as { code: string; map?: unknown })
  const generatedCode: string = isString ? (result as string) : resultObj!.code
  const generatedMap: unknown = isString ? undefined : resultObj!.map

  return {
    code: generatedCode,
    // deno-lint-ignore no-explicit-any
    map: generatedMap as any,
  }
}

/**
 * Scan a CJS source string and return the names of its statically
 * resolvable named exports (`exports.X = Y`), in source order. Used
 * by the dev server's per-spec shim generator to build a destructure
 * against an `import * as ns from "<abs>";` re-export without
 * requiring the consumer to hand-maintain an export list.
 *
 * Each name appears at most once. Duplicate `exports.X = …;` patterns
 * collapse to a single name — consumers only need the names for the
 * destructure, the values resolve at runtime via `module.exports`.
 *
 * Throws if the source can't be parsed as a CJS module.
 */
export function extractCjsExports(
  code: string,
  options: { onDynamicExport?: (message: string) => void } = {},
): CjsExportsScan {
  const looksLikeEsm = /^\s*(?:import|export)\b/m.test(code)
  const ast = parse(code, {
    ecmaVersion: 'latest',
    sourceType: looksLikeEsm ? 'module' : 'script',
    allowReturnOutsideFunction: true,
  }) as Program

  const names: string[] = []
  const seen = new Set<string>()
  let dynamic = false
  walkCjsExportStatements(ast.body, (name) => {
    if (!seen.has(name)) {
      seen.add(name)
      names.push(name)
    }
  }, (msg) => {
    dynamic = true
    options.onDynamicExport?.(msg)
  })

  return { names, dynamic }
}

/**
 * Walk a parsed CJS program body, calling `onName` for each
 * statically-resolvable `exports.X = Y` assignment at any depth and
 * `onDynamic` for any unrecognised export shape (computed keys,
 * `Object.assign(exports, ...)`, `exports = ...`, etc.).
 *
 * Used by both {@linkcode transform} (to decide what to register in
 * the named-exports map) and {@linkcode extractCjsExports} (to build
 * the list of names without mutating the AST). The walker descends
 * into `if/else`, `try/catch/finally`, `with`, `for`, `while`, and
 * other block-scoped statements because names like React's
 * `exports.createRoot` live inside an `if (process.env.NODE_ENV ===
 * 'production') { … }` branch — we want the static name even if we
 * don't know which branch runs at runtime.
 */
function walkCjsExportStatements(
  body: (Statement | ModuleDeclaration)[],
  onName: (name: string) => void,
  onDynamic: (message: string) => void,
): void {
  for (const stmt of body) {
    walkCjsExportStatement(stmt, onName, onDynamic)
  }
}

function walkCjsExportStatement(
  node: Statement | ModuleDeclaration | Expression,
  onName: (name: string) => void,
  onDynamic: (message: string) => void,
): void {
  // Direct hit — `exports.X = Y;` at this position.
  if (node.type === 'ExpressionStatement') {
    const expr = node.expression
    if (expr.type === 'AssignmentExpression') {
      const left = expr.left
      if (left.type === 'MemberExpression') {
        if (left.computed) {
          onDynamic(`computed-key exports assignment — name not statically known`)
          return
        }
        const obj = left.object
        const prop = left.property
        if (obj.type === 'Identifier' && obj.name === 'exports') {
          if (prop.type === 'Identifier') {
            onName(prop.name)
          } else {
            onDynamic(`non-identifier exports property — name not statically known`)
          }
          return
        }
      }
    }
  }
  // Recurse into block-shaped statements so names inside `if/else`
  // and friends are picked up.
  if (node.type === 'IfStatement') {
    walkCjsExportStatement(node.consequent, onName, onDynamic)
    if (node.alternate) walkCjsExportStatement(node.alternate, onName, onDynamic)
    return
  }
  if (node.type === 'BlockStatement') {
    for (const s of node.body) walkCjsExportStatement(s, onName, onDynamic)
    return
  }
  if (node.type === 'WithStatement') {
    walkCjsExportStatement(node.body, onName, onDynamic)
    return
  }
  if (node.type === 'TryStatement') {
    walkCjsExportStatement(node.block, onName, onDynamic)
    if (node.handler) {
      // CatchClause — recurse into its BlockStatement body.
      walkCjsExportStatement(node.handler.body, onName, onDynamic)
    }
    if (node.finalizer) {
      for (const s of node.finalizer.body) walkCjsExportStatement(s, onName, onDynamic)
    }
    return
  }
  if (node.type === 'ForStatement') {
    walkCjsExportStatement(node.body, onName, onDynamic)
    return
  }
  if (node.type === 'WhileStatement') {
    walkCjsExportStatement(node.body, onName, onDynamic)
    return
  }
  if (node.type === 'DoWhileStatement') {
    walkCjsExportStatement(node.body, onName, onDynamic)
    return
  }
  if (node.type === 'ForInStatement') {
    walkCjsExportStatement(node.body, onName, onDynamic)
    return
  }
  if (node.type === 'ForOfStatement') {
    walkCjsExportStatement(node.body, onName, onDynamic)
    return
  }
  if (node.type === 'LabeledStatement') {
    walkCjsExportStatement(node.body, onName, onDynamic)
    return
  }
}

/**
 * Collect the set of top-level binding names in a CJS program body:
 * `function X() {}`, `class X {}`, `var X = …`, `let X = …`,
 * `const X = …`. Used by {@linkcode rewriteBody} to detect
 * assignments like `exports.X = X` whose RHS is already a top-level
 * binding — for those we skip emitting a redundant `const X = …;`
 * and just surface the existing binding as an ESM named export.
 */
function collectTopLevelNames(body: (Statement | ModuleDeclaration)[]): Set<string> {
  const names = new Set<string>()
  for (const stmt of body) {
    if (stmt.type === 'FunctionDeclaration' && stmt.id?.type === 'Identifier') {
      names.add(stmt.id.name)
    } else if (stmt.type === 'ClassDeclaration' && stmt.id?.type === 'Identifier') {
      names.add(stmt.id.name)
    } else if (stmt.type === 'VariableDeclaration') {
      for (const decl of stmt.declarations) {
        for (const id of collectPatternNames(decl.id)) {
          names.add(id)
        }
      }
    }
  }
  return names
}

/**
 * Walk a destructuring / `var` pattern and yield its binding names.
 * Standalone identifier bindings (the canonical case); rest elements
 * and defaults that nest patterns are returned with their inner
 * names too.
 */
function collectPatternNames(
  id: VariableDeclarator['id'],
): string[] {
  if (id.type === 'Identifier') return [id.name]
  if (id.type === 'ObjectPattern') {
    const out: string[] = []
    for (const prop of id.properties) {
      if (prop.type === 'Property' && prop.key.type === 'Identifier') {
        out.push(prop.key.name)
      } else if (prop.type === 'RestElement' && prop.argument?.type === 'Identifier') {
        out.push(prop.argument.name)
      }
    }
    return out
  }
  if (id.type === 'ArrayPattern') {
    const out: string[] = []
    for (const el of id.elements) {
      if (el && el.type === 'Identifier') {
        out.push(el.name)
      } else if (el && el.type === 'RestElement' && el.argument?.type === 'Identifier') {
        out.push(el.argument.name)
      }
    }
    return out
  }
  if (id.type === 'MemberExpression' && id.property.type === 'Identifier') {
    return [id.property.name]
  }
  return []
}

/** Heuristic — does the source string look like CommonJS? */
export function looksLikeCjs(code: string): boolean {
  if (/\bmodule\.exports\s*=/.test(code)) return true
  if (/\bexports\.[A-Za-z_$][\w$]*\s*=/.test(code)) return true
  if (/\brequire\s*\(/.test(code)) return true
  if (/\b__dirname\b/.test(code)) return true
  if (/\b__filename\b/.test(code)) return true
  return false
}

/**
 * Heuristic — does the source string mix ESM and CJS? Files that
 * mix the two need a more conservative transform path because
 * rewriting `require()` → `import` would break the ESM bits.
 */
export function looksLikeMixed(code: string): boolean {
  const hasImport = /\bimport\s+[^'"]+from\s+["']/.test(code) ||
    /\bimport\s*\(/.test(code) ||
    /\bexport\s+(?:default|const|function|class|var|let|\{)/.test(code)
  return hasImport && looksLikeCjs(code)
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Return value convention for the `rewrite*` functions:
 *   - `undefined` → "I don't handle this pattern; leave the
 *                   statement alone."
 *   - `null`      → "I handled this pattern by creating an import;
 *                   the original statement is now redundant; drop it."
 *   - any other   → "Replace the original statement with this one
 *                   (or array of statements)."
 */
type RewriteResult =
  | (Statement | ModuleDeclaration)
  | (Statement | ModuleDeclaration)[]
  | null
  | undefined

/**
 * Shared mutable state threaded through the body walker. The body's
 * imported-name map and the named-export map both need to live
 * somewhere across statement iterations, and the `onDynamicExport`
 * callback is the same plumbing that {@linkcode extractCjsExports}
 * uses for its `dynamic` flag.
 */
interface RewriteContext {
  /** Map of import name → import declaration, prepended at the end. */
  importsByName: Map<string, ImportDeclaration>
  /**
   * Map of named export name → the right-hand-side `Expression` AST
   * node from the *last* `exports.X = Y;` assignment at module top
   * scope. The body's final pass emits one `const X = Y;` per name
   * (last-write-wins mirrors the CJS `module.exports` shape) and a
   * single trailing `export { X, … }` so esbuild surfaces them as
   * ESM named exports.
   */
  namedExports: Map<string, Expression>
  /** Optional callback for unrecognised export shapes. */
  onDynamicExport: ((message: string) => void) | undefined
}

/**
 * Walk the top-level statements of a parsed CJS program and return
 * a new array with the recognised CJS shapes replaced by their ESM
 * equivalents. Top-level statements that don't match a recognised
 * pattern pass through unchanged.
 */
function rewriteBody(
  body: (Statement | ModuleDeclaration)[],
  ctx: RewriteContext,
): (Statement | ModuleDeclaration)[] {
  const result: (Statement | ModuleDeclaration)[] = []
  const { importsByName, namedExports } = ctx

  // Collect names that already have a top-level binding before we
  // walk — for those we don't need to emit a `const X = Y;` later
  // because the original declaration (`function X() {}`,
  // `var X = require("mod")`, etc.) is still in the body. We just
  // need to surface them as ESM exports.
  const existingNames = collectTopLevelNames(body)

  for (const stmt of body) {
    const replaced = tryRewriteStatement(stmt, ctx)
    if (replaced === undefined) {
      // Not my pattern — leave the statement alone.
      result.push(stmt)
    } else if (replaced === null) {
      // I handled this by creating an import; the original
      // statement is now redundant. Drop it.
      continue
    } else if (Array.isArray(replaced)) {
      result.push(...replaced)
    } else {
      result.push(replaced)
    }
  }

  // Emit `const X = Y;` for each captured CJS named-export
  // assignment (last-write-wins), then a single trailing
  // `export { X, Y, … }` so esbuild surfaces them. For names that
  // already have a binding elsewhere in the body (React's
  // `function Children() {} exports.Children = Children;` pattern
  // is the canonical case) we skip the `const X = Y;` and just
  // surface the existing binding.
  const head: (Statement | ModuleDeclaration)[] = []
  if (namedExports.size > 0) {
    const specifiers: ExportSpecifier[] = []
    for (const name of namedExports.keys()) {
      const init = namedExports.get(name)
      if (init === undefined) continue
      const id: Identifier = {
        type: 'Identifier',
        name,
        start: 0,
        end: 0,
      }
      if (!existingNames.has(name)) {
        head.push({
          type: 'VariableDeclaration',
          start: 0,
          end: 0,
          kind: 'const',
          declarations: [{
            type: 'VariableDeclarator',
            start: 0,
            end: 0,
            id,
            init,
          }],
        } as VariableDeclaration)
      }
      specifiers.push({
        type: 'ExportSpecifier',
        start: 0,
        end: 0,
        local: id,
        exported: id,
      } as ExportSpecifier)
    }
    head.push({
      type: 'ExportNamedDeclaration',
      start: 0,
      end: 0,
      specifiers,
      declaration: null,
      source: null,
    } as ExportNamedDeclaration)
  }

  // Prepend the collected `import` statements so they come before
  // any remaining top-level code that uses the bindings.
  const imports = [...importsByName.values()]
  return [...imports, ...head, ...result]
}

function tryRewriteStatement(
  stmt: Statement | ModuleDeclaration,
  ctx: RewriteContext,
): RewriteResult {
  if (stmt.type === 'VariableDeclaration') {
    return rewriteVarDecl(stmt, ctx)
  }
  if (stmt.type === 'ExpressionStatement') {
    return rewriteExprStmt(stmt, ctx)
  }
  return undefined
}

// ---------------------------------------------------------------------------
// `var X = require("spec")`  /  `var { X, Y } = require("spec")`  /  ...
// ---------------------------------------------------------------------------

function rewriteVarDecl(
  stmt: VariableDeclaration,
  ctx: RewriteContext,
): RewriteResult {
  const { importsByName } = ctx
  // We only transform top-level `var`/`let`/`const` declarations
  // whose init is a static `require(spec)` call. Anything else
  // (arithmetic, function calls, object literals, etc.) is left
  // alone.
  if (stmt.declarations.length !== 1) return undefined
  const decl = stmt.declarations[0]
  if (!decl) return undefined
  if (!decl.init) return undefined
  if (decl.init.type !== 'CallExpression') return undefined
  const call = decl.init
  if (!isRequireCall(call)) return undefined
  if (call.arguments.length !== 1) return undefined
  const specArg = call.arguments[0]
  if (!specArg) return undefined
  if (specArg.type !== 'Literal' || typeof specArg.value !== 'string') {
    return undefined
  }
  const spec = specArg.value

  // For destructuring patterns we emit one import per named binding
  // so the local names survive (e.g. `import { foo as foo, bar as bar }
  // from "mod"` for `var { foo, bar } = require("mod")`). For other
  // patterns we emit a single default or namespace import.
  const importNames = collectImportNames(decl.id)
  if (importNames === null) {
    return undefined
  }
  if (importNames.length === 0) {
    return undefined
  }

  const declKind = bindingKindFromPattern(decl.id)
  if (declKind === null) {
    return undefined
  }

  for (const name of importNames) {
    if (!importsByName.has(name)) {
      importsByName.set(
        name,
        buildImportDeclaration(name, spec, declKind),
      )
    }
  }

  // The `var X = require("spec")` statement is now redundant —
  // the binding is established by the `import` statement. Signal
  // the body rewriter to drop the original.
  return null
}

/**
 * Collect the local binding names for a given pattern. Returns
 * `null` for patterns we don't know how to handle (e.g. default +
 * namespace + named all at once, or computed keys).
 */
function collectImportNames(
  id: VariableDeclarator['id'],
): string[] | null {
  if (id.type === 'Identifier') return [id.name]
  if (id.type === 'ObjectPattern') {
    const names: string[] = []
    for (const prop of id.properties) {
      if (prop.type === 'Property' && prop.key.type === 'Identifier') {
        names.push(prop.key.name)
      } else {
        // Computed key, rest element, or some other shape we
        // can't statically resolve. Bail out.
        return null
      }
    }
    return names
  }
  if (id.type === 'ArrayPattern') {
    if (id.elements.length === 0) return []
    const names: string[] = []
    for (const el of id.elements) {
      if (el && el.type === 'Identifier') {
        names.push(el.name)
      } else {
        return null
      }
    }
    return names
  }
  if (id.type === 'MemberExpression') {
    // `var ns = require("mod")` — `import * as ns from "mod"`.
    if (id.property.type === 'Identifier') return [id.property.name]
    return null
  }
  return null
}

/** Build a fresh `ImportDeclaration` for the given import name. */
function buildImportDeclaration(
  name: string,
  spec: string,
  kind: 'side-effect' | 'default' | 'namespace' | 'named',
): ImportDeclaration {
  const source: Literal = {
    type: 'Literal',
    start: 0,
    end: 0,
    value: spec,
    raw: JSON.stringify(spec),
  }
  const importDecl: ImportDeclaration = {
    type: 'ImportDeclaration',
    start: 0,
    end: 0,
    specifiers: [],
    source,
    attributes: [],
  }
  switch (kind) {
    case 'side-effect':
      // no specifiers — `import "spec"`
      return importDecl
    case 'default':
      importDecl.specifiers = [
        {
          type: 'ImportDefaultSpecifier',
          start: 0,
          end: 0,
          local: { type: 'Identifier', name, start: 0, end: 0 },
        } as ImportDefaultSpecifier,
      ]
      return importDecl
    case 'namespace':
      importDecl.specifiers = [
        {
          type: 'ImportNamespaceSpecifier',
          start: 0,
          end: 0,
          local: { type: 'Identifier', name, start: 0, end: 0 },
        } as ImportNamespaceSpecifier,
      ]
      return importDecl
    case 'named': {
      // For `var { X, Y } = require("mod")` we emit
      // `import { X as X, Y as Y } from "mod"` so the original
      // local names are preserved.
      importDecl.specifiers = [
        {
          type: 'ImportSpecifier',
          start: 0,
          end: 0,
          imported: { type: 'Identifier', name, start: 0, end: 0 },
          local: { type: 'Identifier', name, start: 0, end: 0 },
        } as ImportSpecifier,
      ]
      return importDecl
    }
  }
}

/** Decide what kind of import to emit for a given LHS pattern. */
function bindingKindFromPattern(
  id: VariableDeclarator['id'],
): 'side-effect' | 'default' | 'namespace' | 'named' | null {
  if (id.type === 'Identifier') return 'default'
  if (id.type === 'ObjectPattern' || id.type === 'ArrayPattern') {
    return 'named'
  }
  if (id.type === 'MemberExpression') {
    // `var ns = require("mod"); ns.X` → `import * as ns from "mod"`
    return 'namespace'
  }
  return null
}

// ---------------------------------------------------------------------------
// `module.exports = X`  /  `require("spec")` (side-effect)
// ---------------------------------------------------------------------------

function rewriteExprStmt(
  stmt: ExpressionStatement,
  ctx: RewriteContext,
): RewriteResult {
  const { importsByName, namedExports, onDynamicExport } = ctx
  const expr = stmt.expression

  if (expr.type === 'AssignmentExpression') {
    const left = expr.left
    if (left.type === 'MemberExpression') {
      const me = left
      const obj = me.object
      const prop = me.property
      if (
        obj.type === 'Identifier' && obj.name === 'module' &&
        prop.type === 'Identifier' && prop.name === 'exports' && !me.computed
      ) {
        return rewriteModuleExports(expr.right, ctx)
      }
      // `exports.X = Y` — track the (name, right-hand-side) pair so
      // the body can emit `const X = Y; export { X }` later. The
      // previous behaviour left the assignment in place, which threw
      // `ReferenceError: exports is not defined` at runtime in an
      // ESM module. Surfacing the names via a single trailing
      // `export { … }` is what makes esbuild forward them. Last
      // write wins — `namedExports.set` overwrites any prior entry,
      // matching the CJS `module.exports` shape.
      if (
        obj.type === 'Identifier' && obj.name === 'exports' &&
        prop.type === 'Identifier'
      ) {
        if (me.computed) {
          // `exports["X"] = Y` / `exports[expr] = Y` — emit a
          // warning and pass through unchanged. The result still
          // parses, but consumers won't see this name statically.
          onDynamicExport?.(
            `exports[${prop.name}] = … (computed key) — leave as-is`,
          )
          return undefined
        }
        namedExports.set(prop.name, expr.right)
        return null
      }
    }
    // Unrecognised assignment — leave it alone.
    onDynamicExport?.(
      `unrecognised top-level assignment — left as-is (will likely fail in ESM)`,
    )
    return undefined
  }

  // `require("spec")` (no assignment) — side-effect import.
  if (expr.type === 'CallExpression' && isRequireCall(expr)) {
    if (expr.arguments.length === 1) {
      const specArg = expr.arguments[0]
      if (!specArg) return undefined
      if (specArg.type === 'Literal' && typeof specArg.value === 'string') {
        const spec = specArg.value
        const key = `__side__${spec}`
        if (!importsByName.has(key)) {
          importsByName.set(
            key,
            buildImportDeclaration('', spec, 'side-effect'),
          )
        }
        // The `require("spec")` statement is replaced by the
        // side-effect import — drop the original statement.
        return null
      }
    }
  }

  return undefined
}

/**
 * Rewrite the right-hand side of `module.exports = X` and emit an
 * `export default …` statement. For `module.exports = require("mod")`
 * we additionally need to register a `import * as _mod from "mod"`
 * binding so the `export default` can refer to it.
 */
function rewriteModuleExports(
  right: Expression,
  ctx: RewriteContext,
): RewriteResult {
  const { importsByName } = ctx
  // Common case: `module.exports = require("mod")`. We need an
  // `import * as _mod from "mod"; export default _mod` pair.
  if (right.type === 'CallExpression' && isRequireCall(right)) {
    if (right.arguments.length === 1) {
      const specArg = right.arguments[0]
      if (!specArg) return undefined
      if (specArg.type === 'Literal' && typeof specArg.value === 'string') {
        const spec = specArg.value
        const localName = '_mod'
        if (!importsByName.has(localName)) {
          importsByName.set(
            localName,
            buildImportDeclaration(localName, spec, 'namespace'),
          )
        }
        const defaultExport: ExportDefaultDeclaration = {
          type: 'ExportDefaultDeclaration',
          start: 0,
          end: 0,
          declaration: {
            type: 'Identifier',
            name: localName,
            start: 0,
            end: 0,
          },
        }
        return defaultExport
      }
    }
  }
  // For `module.exports = { foo: 1 }` we emit
  //   const foo = 1;
  //   export default { foo };
  // which preserves the original object shape without enumerating
  // arbitrary computed keys. Shorthand properties (`{ foo }`) are
  // emitted as-is — hoisting the shorthand value into a `const foo
  // = foo` would shadow the outer `foo` (TDZ) and trip esbuild's
  // duplicate-declaration check.
  if (right.type === 'ObjectExpression') {
    const innerStmts: VariableDeclaration[] = []
    const exportProps: (Identifier | Expression)[] = []
    for (const prop of right.properties) {
      if (prop.type !== 'Property') continue
      if (prop.computed) continue
      if (prop.key.type !== 'Identifier') continue
      if (prop.shorthand && prop.value.type === 'Identifier') {
        // Shorthand — use the original identifier directly.
        exportProps.push(prop.value)
        continue
      }
      // Non-shorthand — hoist the value into a `const` so we can
      // both reference it in the `export default` and not
      // re-evaluate it.
      innerStmts.push({
        type: 'VariableDeclaration',
        start: 0,
        end: 0,
        kind: 'const',
        declarations: [{
          type: 'VariableDeclarator',
          start: 0,
          end: 0,
          id: {
            type: 'Identifier',
            name: prop.key.name,
            start: 0,
            end: 0,
          },
          init: prop.value,
        }],
      } as VariableDeclaration)
      exportProps.push({
        type: 'Identifier',
        name: prop.key.name,
        start: 0,
        end: 0,
      } as Identifier)
    }
    // Build the object literal referencing the hoisted locals /
    // original shorthand identifiers.
    const objectLit: ObjectExpression = {
      type: 'ObjectExpression',
      start: 0,
      end: 0,
      properties: exportProps.map((value) => ({
        type: 'Property',
        start: 0,
        end: 0,
        key: value.type === 'Identifier' ? value : ({
          type: 'Identifier',
          name: 'unknown',
          start: 0,
          end: 0,
        } as Identifier),
        value,
        kind: 'init',
        method: false,
        shorthand: value.type === 'Identifier',
        computed: false,
      } as Property)),
    }
    const defaultExport: ExportDefaultDeclaration = {
      type: 'ExportDefaultDeclaration',
      start: 0,
      end: 0,
      declaration: objectLit,
    }
    return [...innerStmts, defaultExport]
  }
  // Fall-through: emit `export default <right>`. The right side
  // may be a complex expression (function literal, conditional,
  // etc.); emitting it once is the right behaviour.
  const defaultExport: ExportDefaultDeclaration = {
    type: 'ExportDefaultDeclaration',
    start: 0,
    end: 0,
    declaration: right,
  }
  return defaultExport
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Is `node` a `require(...)` call? */
function isRequireCall(node: CallExpression): boolean {
  return node.callee.type === 'Identifier' &&
    node.callee.name === 'require'
}
