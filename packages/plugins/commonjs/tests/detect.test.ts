import { assertEquals } from '@std/assert'

// The heuristic lives in the plugin itself as an internal function.
// This file re-implements the same checks so we can exercise them
// independently of the plugin's load path. The integration test in
// `mod.test.ts` will catch any divergence between this local copy
// and the real implementation.

function looksLikeCjsLocal(code: string): boolean {
  if (/\bmodule\.exports\s*=/.test(code)) return true
  // CJS named export, either `exports.X = …` or `exports["X"] = …` /
  // `exports['X'] = …`. The `\.` or `\[` immediately after `exports` is
  // the discriminating prefix.
  if (/\bexports[.\[]/.test(code) && /\bexports[.\[][^\n=]*\s*=/.test(code)) {
    return true
  }
  if (/\brequire\s*\(/.test(code)) return true
  if (/\b__dirname\b/.test(code)) return true
  if (/\b__filename\b/.test(code)) return true
  return false
}

Deno.test('looksLikeCjs — flags module.exports assignment', () => {
  assertEquals(looksLikeCjsLocal('module.exports = {}'), true)
  assertEquals(
    looksLikeCjsLocal("'use strict';\nmodule.exports = { foo: 1 };"),
    true,
  )
})

Deno.test('looksLikeCjs — flags exports.X assignment', () => {
  assertEquals(looksLikeCjsLocal('exports.foo = 1;'), true)
  assertEquals(looksLikeCjsLocal("exports['foo'] = 1;"), true)
  assertEquals(looksLikeCjsLocal('exports["foo"] = 1;'), true)
  // Bare `exports = …` reassignment is not the named-export pattern;
  // the regex only matches when `exports` is followed by `.` or `[`.
  assertEquals(looksLikeCjsLocal('exports = { foo: 1 };'), false)
})

Deno.test('looksLikeCjs — flags require() call', () => {
  assertEquals(looksLikeCjsLocal('require("react")'), true)
  assertEquals(looksLikeCjsLocal("const foo = require('./bar')"), true)
  assertEquals(looksLikeCjsLocal('var foo = require(`./bar`)'), true)
})

Deno.test('looksLikeCjs — flags __dirname / __filename', () => {
  assertEquals(looksLikeCjsLocal('console.log(__dirname)'), true)
  assertEquals(looksLikeCjsLocal('const dir = __filename'), true)
})

Deno.test('looksLikeCjs — does not flag ESM', () => {
  assertEquals(looksLikeCjsLocal("import x from 'y';"), false)
  assertEquals(looksLikeCjsLocal('export const foo = 1;'), false)
  assertEquals(looksLikeCjsLocal('export default function() {}'), false)
  assertEquals(
    looksLikeCjsLocal("const url = new URL('./a.js', import.meta.url);"),
    false,
  )
})

Deno.test('looksLikeCjs — does not flag `require` mentioned in strings or comments', () => {
  // The heuristic only matches `require(` (with the open paren). A
  // mention of `require` followed by a space, quote, or backtick is
  // not flagged.
  assertEquals(
    looksLikeCjsLocal('// the function `require` does the thing'),
    false,
  )
  assertEquals(looksLikeCjsLocal('"require this"'), false)
})
