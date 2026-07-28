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
 *   exports.X = Y                      →  assignment left in place
 *                                          (X becomes a free identifier
 *                                          in the new ESM module, since
 *                                          the file's other CJS surface
 *                                          was rewritten away)
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
}

/** Result of a {@linkcode transform} call. */
export interface TransformResult {
  code: string
  // deno-lint-ignore no-explicit-any
  map?: any
}

/**
 * Convert a CJS source string to ESM. Returns the transformed source
 * (and optionally a source map). Throws if the source can't be
 * parsed — callers should treat parse errors as "skip the transform"
 * and let esbuild's default CJS handler take over.
 */
export function transform(
  code: string,
  options: TransformOptions = {},
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

  const newBody: (Statement | ModuleDeclaration)[] = rewriteBody(ast.body)

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
 * Walk the top-level statements of a parsed CJS program and return
 * a new array with the recognised CJS shapes replaced by their ESM
 * equivalents. Top-level statements that don't match a recognised
 * pattern pass through unchanged.
 */
function rewriteBody(
  body: (Statement | ModuleDeclaration)[],
): (Statement | ModuleDeclaration)[] {
  const result: (Statement | ModuleDeclaration)[] = []
  // Map of import name → import declaration. The body rewriter
  // stashes imports here and prepends them once at the end of the
  // walk so they come before any remaining top-level code that
  // uses the bindings.
  const importsByName = new Map<string, ImportDeclaration>()

  for (const stmt of body) {
    const replaced = tryRewriteStatement(stmt, importsByName)
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

  // Prepend the collected `import` statements so they come before
  // any remaining top-level code that uses the bindings.
  const imports = [...importsByName.values()]
  return [...imports, ...result]
}

function tryRewriteStatement(
  stmt: Statement | ModuleDeclaration,
  importsByName: Map<string, ImportDeclaration>,
): RewriteResult {
  if (stmt.type === 'VariableDeclaration') {
    return rewriteVarDecl(stmt, importsByName)
  }
  if (stmt.type === 'ExpressionStatement') {
    return rewriteExprStmt(stmt, importsByName)
  }
  return undefined
}

// ---------------------------------------------------------------------------
// `var X = require("spec")`  /  `var { X, Y } = require("spec")`  /  ...
// ---------------------------------------------------------------------------

function rewriteVarDecl(
  stmt: VariableDeclaration,
  importsByName: Map<string, ImportDeclaration>,
): RewriteResult {
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
  importsByName: Map<string, ImportDeclaration>,
): RewriteResult {
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
        return rewriteModuleExports(expr.right, importsByName)
      }
      // `exports.X = Y` — leave in place as a regular
      // assignment (X becomes a free identifier in the new ESM
      // module, which is the right behaviour for React's pattern
      // of doing `exports.X = Y` and then reading X elsewhere).
      if (
        obj.type === 'Identifier' && obj.name === 'exports' && !me.computed &&
        prop.type === 'Identifier'
      ) {
        return undefined
      }
    }
    // Unrecognised assignment — leave it alone.
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
  importsByName: Map<string, ImportDeclaration>,
): RewriteResult {
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
