import { assertEquals, assertStringIncludes } from '@std/assert'
import { extractCjsExports, looksLikeCjs, transform } from '../transform.ts'

Deno.test('transform — `var X = require("spec")` becomes `import X from "spec"`', () => {
  const { code } = transform("var React = require('react');")
  assertStringIncludes(code, 'import React from "react"')
  assertEquals(code.includes('require('), false)
})

Deno.test('transform — `var { X, Y } = require("spec")` becomes `import { X, Y } from "spec"`', () => {
  const { code } = transform("var { foo, bar } = require('mod');")
  // The transformer emits named imports for each destructured key.
  // Whether or not the output uses shorthand (`{ foo }`) or long
  // form (`{ foo as foo }`) is a print-quality detail left to
  // astring; we just check that the bindings and the source are
  // there.
  assertStringIncludes(code, 'from "mod"')
  assertStringIncludes(code, 'foo')
  assertStringIncludes(code, 'bar')
  assertEquals(code.includes('require('), false)
})

Deno.test('transform — `module.exports = X` becomes `export default X`', () => {
  const { code } = transform('module.exports = 42;')
  assertStringIncludes(code, 'export default 42')
  assertEquals(code.includes('module.exports'), false)
})

Deno.test('transform — `module.exports = require("mod")` becomes namespace import + default re-export', () => {
  const { code } = transform("module.exports = require('mod');")
  assertStringIncludes(code, 'import * as _mod from "mod"')
  assertStringIncludes(code, 'export default _mod')
  assertEquals(code.includes('require('), false)
})

Deno.test('transform — `module.exports = { foo: 1 }` becomes hoisted consts + default object', () => {
  const { code } = transform('module.exports = { foo: 1, bar: 2 };')
  // The hoisted consts + a default object literal whose `foo`/`bar`
  // properties refer to the consts. The exact form
  // (`export default { foo, bar }` vs `export default { foo: foo, bar: bar }`)
  // is left to astring; we just check that the consts and a
  // default export with the right keys are there.
  assertStringIncludes(code, 'const foo = 1')
  assertStringIncludes(code, 'const bar = 2')
  assertStringIncludes(code, 'export default')
  assertStringIncludes(code, 'foo')
  assertStringIncludes(code, 'bar')
  assertEquals(code.includes('module.exports'), false)
})

Deno.test('transform — standalone `require("spec")` becomes a side-effect import', () => {
  const { code } = transform("require('side-effect');")
  assertStringIncludes(code, 'import "side-effect"')
  assertEquals(code.includes('require('), false)
})

Deno.test('transform — two requires become two imports', () => {
  const { code } = transform("var X = require('mod1'); var Y = require('mod2');")
  assertStringIncludes(code, 'import X from "mod1"')
  assertStringIncludes(code, 'import Y from "mod2"')
})

Deno.test('transform — non-CJS source passes through unchanged', () => {
  const src = 'export const foo = 1; export default foo;'
  const { code } = transform(src)
  assertStringIncludes(code, 'export const foo = 1')
  assertStringIncludes(code, 'export default foo')
})

Deno.test('transform — `exports.X = Y` becomes `const X = Y` + named export', () => {
  const { code } = transform('exports.Foo = Foo;')
  // The CJS expression must NOT survive (it would throw at runtime
  // because `exports` is undefined in an ESM module).
  assertEquals(code.includes('exports.Foo'), false)
  assertEquals(code.includes('exports[Foo]'), false)
  // The named binding must be a `const` plus a trailing `export { … }`.
  assertStringIncludes(code, 'const Foo')
  assertStringIncludes(code, 'export')
  assertStringIncludes(code, 'Foo')
})

Deno.test('transform — `exports.X = X` reuses an existing top-level binding', () => {
  // React's CJS source uses this pattern at module top scope:
  // `function Children() { … }`, then `exports.Children = Children;`.
  // We must NOT emit `const Children = Children;` (which would be a
  // duplicate declaration); we just surface the existing binding.
  const src = `function add() { return 1; }\nexports.add = add;`
  const { code } = transform(src)
  assertEquals(code.includes('exports.add'), false)
  assertEquals(code.includes('const add'), false)
  assertStringIncludes(code, 'function add')
  assertStringIncludes(code, 'export {')
  assertStringIncludes(code, 'add')
})

Deno.test('transform — multiple `exports.X = Y` aggregate into one trailing `export { … }`', () => {
  const { code } = transform('exports.A = 1;\nexports.B = 2;\nexports.C = 3;')
  assertEquals(code.includes('exports.'), false)
  assertStringIncludes(code, 'const A')
  assertStringIncludes(code, 'const B')
  assertStringIncludes(code, 'const C')
  assertStringIncludes(code, 'export')
  // Each value must be wired into the matching binding.
  assertStringIncludes(code, 'A')
  assertStringIncludes(code, 'B')
  assertStringIncludes(code, 'C')
})

Deno.test('transform — duplicate `exports.X = …` keeps only the last value', () => {
  // CJS semantics: `exports.X = A; exports.X = B;` reads as
  // `module.exports.X = B` at runtime. The transform emits ONE const,
  // bound to the last value, so destructuring from the namespace sees
  // the runtime-correct value.
  const { code } = transform('exports.X = 1;\nexports.X = 2;')
  assertEquals(code.includes('exports.'), false)
  // One `const X = …` line, bound to the last `2`.
  const matches = code.match(/const X\s*=/g) ?? []
  assertEquals(matches.length, 1, `expected one const X, got:\n${code}`)
  assertStringIncludes(code, 'X = 2')
})

Deno.test('transform — computed-key `exports["X"] = Y` is left in place + onDynamicExport fires', () => {
  let dynamicMsg = ''
  const { code } = transform('exports["Foo"] = Foo;', {
    onDynamicExport: (m) => {
      dynamicMsg = m
    },
  })
  // The computed-key assignment is left untouched — there is no
  // safe static rewrite that doesn't risk runtime breakage.
  assertStringIncludes(code, 'exports["Foo"]')
  assertEquals(code.includes('const Foo'), false)
  assertEquals(dynamicMsg.length > 0, true, 'onDynamicExport should have fired')
})

Deno.test('transform — top-level `exports = …` reassignment does not register names', () => {
  let dynamicMsg = ''
  const { code } = transform('exports.A = 1; exports = { Foo: 1 };', {
    onDynamicExport: (m) => {
      dynamicMsg = m
    },
  })
  // `exports = …` is a non-MemberExpression assignment, so it falls
  // through the rewrite path unchanged. That means the runtime would
  // throw (`exports` is undefined in an ESM module), but no named
  // export `Foo` gets registered with esbuild — only the legitimate
  // `exports.A = 1;` rewrites to `const A; export { A }`.
  assertStringIncludes(code, 'const A = 1')
  assertEquals(code.includes('export {A, Foo}'), false)
  assertEquals(code.includes('export {Foo}'), false)
  assertEquals(dynamicMsg.length > 0, true)
})

Deno.test('transform — file with a single require() and no exports becomes pure ESM', () => {
  const src = "var React = require('react');\nconsole.log(React);"
  const { code } = transform(src)
  assertStringIncludes(code, 'import React from "react"')
  assertEquals(code.includes('require('), false)
  assertStringIncludes(code, 'console.log(React)')
})

Deno.test('transform — `__dirname` and `__filename` references do not break the transform', () => {
  // The transformer doesn't translate `__dirname` / `__filename`
  // because they don't have an ESM equivalent. They get left as-is
  // (and would fail at browser runtime — but that's the caller's
  // problem, not the transformer's). The file still goes through the
  // CJS-to-ESM path.
  const src = 'var dir = __dirname; module.exports = dir;'
  const { code } = transform(src)
  assertStringIncludes(code, 'export default dir')
  assertStringIncludes(code, '__dirname')
})

Deno.test('extractCjsExports — React-shaped source returns the named exports', () => {
  // The shape React 18's `cjs/react.development.js` uses: a long
  // sequence of `exports.X = Y;` statements near the end of the
  // file. The scan should pick all of them up.
  const src = `
'use strict';
function f() {}
function g() {}
function h() {}
exports.Children = Children;
exports.Component = Component;
exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = ReactSharedInternals;
exports.version = ReactVersion;
`
  const scan = extractCjsExports(src)
  assertEquals(scan.dynamic, false)
  assertEquals(scan.names, [
    'Children',
    'Component',
    '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED',
    'version',
  ])
})

Deno.test('extractCjsExports — duplicate assignments collapse to one name', () => {
  const src = 'exports.A = 1; exports.A = 2; exports.B = 3;'
  const scan = extractCjsExports(src)
  assertEquals(scan.dynamic, false)
  assertEquals(scan.names, ['A', 'B'])
})

Deno.test('extractCjsExports — computed keys set dynamic + skip the name', () => {
  let dynamicCount = 0
  const src = 'exports.A = 1; exports["B"] = 2; exports[expr] = 3;'
  const scan = extractCjsExports(src, {
    onDynamicExport: () => {
      dynamicCount++
    },
  })
  assertEquals(scan.dynamic, true)
  assertEquals(scan.names, ['A'])
  assertEquals(dynamicCount >= 2, true)
})

Deno.test('extractCjsExports — `exports = …` reassignment does not register names', () => {
  const src = 'exports.A = 1; exports = { B: 2 };'
  const scan = extractCjsExports(src)
  assertEquals(scan.names, ['A'])
})

Deno.test('extractCjsExports — recurses into if/else branches', () => {
  // `react-dom/client.js` ships with this exact shape — a `process.env`
  // check at top level that picks between two branches, each with its
  // own `exports.X = Y;` assignments. The scan must pick up names from
  // BOTH branches because we don't know at build time which one runs.
  const src = `
var m = require('react-dom');
if (process.env.NODE_ENV === 'production') {
  exports.createRoot = m.createRoot;
  exports.hydrateRoot = m.hydrateRoot;
} else {
  exports.createRoot = function (c, o) { return m.createRoot(c, o); };
  exports.hydrateRoot = function (c, h, o) { return m.hydrateRoot(c, h, o); };
}
`
  const scan = extractCjsExports(src)
  assertEquals(scan.names, ['createRoot', 'hydrateRoot'])
})

Deno.test('extractCjsExports — recurses into nested blocks', () => {
  const src = `
{
  {
    exports.A = 1;
    exports.B = 2;
  }
}
try {
  exports.C = 3;
} catch (e) {
  exports.D = 4;
}
for (var i = 0; i < 1; i++) {
  exports.E = 5;
}
`
  const scan = extractCjsExports(src)
  assertEquals(scan.names, ['A', 'B', 'C', 'D', 'E'])
})

Deno.test('looksLikeCjs — flags `module.exports = …`', () => {
  assertEquals(looksLikeCjs('module.exports = {}'), true)
})

Deno.test('looksLikeCjs — flags `exports.X = …`', () => {
  assertEquals(looksLikeCjs('exports.foo = 1;'), true)
})

Deno.test('looksLikeCjs — flags `require(…)`', () => {
  assertEquals(looksLikeCjs("require('foo')"), true)
})

Deno.test('looksLikeCjs — flags `__dirname` and `__filename`', () => {
  assertEquals(looksLikeCjs('__dirname'), true)
  assertEquals(looksLikeCjs('__filename'), true)
})

Deno.test('looksLikeCjs — does not flag pure ESM', () => {
  assertEquals(looksLikeCjs("import x from 'y';"), false)
  assertEquals(looksLikeCjs('export const foo = 1;'), false)
})
