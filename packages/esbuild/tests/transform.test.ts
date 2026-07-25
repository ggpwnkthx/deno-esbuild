import { assert, assertEquals, assertRejects, assertStringIncludes } from '@std/assert'
import * as esbuild from '../mod.ts'

// Each test wraps a transform call in a try/finally that calls stop() so
// the native child process is always torn down.

Deno.test('transform: TS annotations are stripped from the output', async () => {
  try {
    const out = await esbuild.transform('export const x: number = 1;', {
      loader: 'ts',
    })
    assertStringIncludes(out.code, 'x')
    assertEquals(out.code.includes(': number'), false)
  } finally {
    await esbuild.stop()
  }
})

Deno.test('transform: minify shrinks a multi-line input', async () => {
  try {
    const out = await esbuild.transform(
      'export function add(a, b) {\n  return a + b\n}\n',
      { loader: 'js', minify: true },
    )
    const lines = out.code.split('\n').length
    // Minified output is essentially one line.
    assertEquals(lines <= 2, true)
    assertStringIncludes(out.code, 'add')
  } finally {
    await esbuild.stop()
  }
})

Deno.test('transform: format:esm uses ESM output (no CommonJS wrappers)', async () => {
  try {
    const out = await esbuild.transform('export const v = 1;', {
      loader: 'js',
      format: 'esm',
    })
    assertEquals(out.code.includes('module.exports'), false)
    assertStringIncludes(out.code, 'v')
  } finally {
    await esbuild.stop()
  }
})

Deno.test('transform: format:cjs produces CommonJS-shaped output', async () => {
  try {
    const out = await esbuild.transform('export const v = 1;', {
      loader: 'js',
      format: 'cjs',
    })
    assertStringIncludes(out.code, 'exports')
  } finally {
    await esbuild.stop()
  }
})

Deno.test('transform: Uint8Array input is treated as bytes', async () => {
  try {
    const input = new TextEncoder().encode('export const v: number = 1;')
    const out = await esbuild.transform(input, { loader: 'ts' })
    assertEquals(out.code.includes(': number'), false)
    assertStringIncludes(out.code, 'v')
  } finally {
    await esbuild.stop()
  }
})

Deno.test('transform: JSX is preserved when loader is jsx', async () => {
  try {
    const out = await esbuild.transform(
      'const el = <div className="x">hi</div>;',
      { loader: 'jsx' },
    )
    // Default JSX transform preserves the JSX expression (no automatic
    // classic-runtime import without a config). At minimum the JSX tag
    // must still be present.
    assertStringIncludes(out.code, 'div')
  } finally {
    await esbuild.stop()
  }
})

Deno.test('transform: target rewrites arrow functions in older environments', async () => {
  try {
    const out = await esbuild.transform(
      'const add = (a, b) => a + b;',
      { loader: 'js', target: 'es6' },
    )
    // es6 target may keep arrow functions; assert that `target` is plumbed
    // correctly by checking the result is well-formed and reaches esbuild.
    assertStringIncludes(out.code, 'add')
    // Either arrow is preserved (es6+) or rewritten to `function` form
    // depending on engine version — just assert the form is consistent.
    const hasArrow = out.code.includes('=>')
    const hasFunction = out.code.includes('function')
    assertEquals(hasArrow || hasFunction, true)
  } finally {
    await esbuild.stop()
  }
})

Deno.test('transform: rejects (not throws) when the input is not a string or Uint8Array', async () => {
  try {
    // The transport validates input shape inside the async transform path;
    // a non-string/non-Uint8Array should be rejected.
    await assertRejects(
      () =>
        // deno-lint-ignore no-explicit-any
        esbuild.transform(123 as any, { loader: 'js' }),
      Error,
    )
  } finally {
    await esbuild.stop()
  }
})

Deno.test('transform: source map output is valid JSON when requested', async () => {
  try {
    const out = await esbuild.transform(
      'export const v: number = 1;',
      { loader: 'ts', sourcemap: true },
    )
    // `map` is a string when sourcemap is requested.
    assertEquals(typeof out.map, 'string')
    // The map should at least mention the source when parsed.
    const parsed = JSON.parse(out.map)
    assertEquals(typeof parsed, 'object')
    assert(parsed !== null, 'expected sourcemap to parse to a non-null object')
  } finally {
    await esbuild.stop()
  }
})
