import { assertEquals, assertStringIncludes } from '@std/assert'
import { looksLikeCjs, transform } from '../transform.ts'

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

Deno.test('transform — complex non-CJS expressions are left alone', () => {
  // Function expressions assigned via exports.X stay in place as
  // `exports.X = …` because replacing them with `export const X` would
  // shadow the binding elsewhere in the file.
  const { code } = transform('exports.X = function () { return 1; };')
  assertStringIncludes(code, 'exports.X =')
  assertEquals(code.includes('export const X'), false)
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
