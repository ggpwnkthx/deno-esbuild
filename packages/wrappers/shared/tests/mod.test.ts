import { assertEquals, assertExists } from '@std/assert'
import type { EsbuildLike } from '../mod.ts'
import {
  createTranspiler,
  DEFAULT_CONTENT_TYPE,
  DEFAULT_EXTENSIONS,
  shouldTranspile,
} from '../mod.ts'

const source = 'export const value: number = 1;\n'

Deno.test('shouldTranspile - matches default extensions', () => {
  assertEquals(shouldTranspile('/path/to/file.ts'), true)
  assertEquals(shouldTranspile('/path/to/file.tsx'), true)
  assertEquals(shouldTranspile('/path/to/file.js'), false)
  assertEquals(shouldTranspile('/path/to/file.css'), false)
})

Deno.test('shouldTranspile - honors custom extensions list', () => {
  assertEquals(shouldTranspile('/path/to/file.vue', ['.vue']), true)
  assertEquals(shouldTranspile('/path/to/file.ts', ['.vue']), false)
})

Deno.test('DEFAULT_EXTENSIONS and DEFAULT_CONTENT_TYPE have expected values', () => {
  assertEquals(DEFAULT_EXTENSIONS, ['.ts', '.tsx'])
  assertEquals(DEFAULT_CONTENT_TYPE, 'text/javascript')
})

Deno.test('createTranspiler - returns object with expected surface', () => {
  const transpiler = createTranspiler()
  assertExists(transpiler.getCachedOrTranspile)
  assertExists(transpiler.clearCache)
})

Deno.test('createTranspiler - cache: true reuses prior transform result', async () => {
  let transformCallCount = 0
  const mockEsbuild: EsbuildLike = {
    transform: (input: string | Uint8Array) => {
      transformCallCount++
      const text = typeof input === 'string' ? input : new TextDecoder().decode(input)
      return Promise.resolve({ code: text.replace(': number', '') })
    },
    stop: () => Promise.resolve(),
  }

  const transpiler = createTranspiler({
    cache: true,
    esbuild: mockEsbuild,
  })

  const first = await transpiler.getCachedOrTranspile({
    pathname: '/cached.ts',
    body: source,
    shouldStop: false,
  })
  const second = await transpiler.getCachedOrTranspile({
    pathname: '/cached.ts',
    body: source,
    shouldStop: false,
  })

  assertEquals(transformCallCount, 1)
  assertEquals(first.code, second.code)
  assertEquals(first.code, 'export const value = 1;\n')
})

Deno.test('createTranspiler - cache: false transforms every request', async () => {
  let transformCallCount = 0
  const mockEsbuild: EsbuildLike = {
    transform: (input: string | Uint8Array) => {
      transformCallCount++
      const text = typeof input === 'string' ? input : new TextDecoder().decode(input)
      return Promise.resolve({ code: text.replace(': number', '') })
    },
    stop: () => Promise.resolve(),
  }

  const transpiler = createTranspiler({ esbuild: mockEsbuild })

  await transpiler.getCachedOrTranspile({
    pathname: '/uncached.ts',
    body: source,
    shouldStop: false,
  })
  await transpiler.getCachedOrTranspile({
    pathname: '/uncached.ts',
    body: source,
    shouldStop: false,
  })

  assertEquals(transformCallCount, 2)
})

Deno.test('createTranspiler - clearCache empties stored entries', async () => {
  let transformCallCount = 0
  const mockEsbuild: EsbuildLike = {
    transform: (_input: string | Uint8Array) => {
      transformCallCount++
      return Promise.resolve({ code: 'ok' })
    },
    stop: () => Promise.resolve(),
  }

  const transpiler = createTranspiler({ cache: true, esbuild: mockEsbuild })

  await transpiler.getCachedOrTranspile({
    pathname: '/clear-me.ts',
    body: source,
    shouldStop: false,
  })
  transpiler.clearCache()
  await transpiler.getCachedOrTranspile({
    pathname: '/clear-me.ts',
    body: source,
    shouldStop: false,
  })

  assertEquals(transformCallCount, 2)
})
