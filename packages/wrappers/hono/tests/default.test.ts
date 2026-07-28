import { assertEquals, assertStringIncludes } from '@std/assert'
import { Hono } from 'hono'
import type { EsbuildLike } from '@ggpwnkthx/esbuild-wrapper-shared'
import esbuildMiddleware from '../mod.ts'

const source = 'export const value: number = 1;\n'

const createApp = (): Hono => {
  const app = new Hono()

  app.use('*', esbuildMiddleware())

  app.use('*', async (c) =>
    await c.body(source, 200, {
      'content-type': 'application/typescript',
      'content-length': String(source.length),
    }))

  return app
}

Deno.test('default transpiler transforms TypeScript responses', async () => {
  const app = createApp()

  const res = await app.request('http://localhost/mod.ts')
  const body = await res.text()

  assertEquals(res.status, 200)
  assertEquals(res.headers.get('content-type'), 'text/javascript')
  assertEquals(res.headers.has('content-length'), false)

  assertStringIncludes(body, 'export const value = 1;')
  assertEquals(body.includes(': number'), false)
})

Deno.test('cache: true skips esbuild.transform on repeat requests', async () => {
  let transformCallCount = 0
  const mockEsbuild: EsbuildLike = {
    transform: (input: string | Uint8Array) => {
      transformCallCount++
      const text = typeof input === 'string' ? input : new TextDecoder().decode(input)
      return Promise.resolve({ code: text.replace(': number', '') })
    },
    stop: () => Promise.resolve(),
  }

  const app = new Hono()
  app.use(
    '*',
    esbuildMiddleware({
      cache: true,
      esbuild: mockEsbuild,
    }),
  )
  app.use('*', async (c) =>
    await c.body(source, 200, {
      'content-type': 'application/typescript',
      'content-length': String(source.length),
    }))

  // First request - should call transform
  const res1 = await app.request('http://localhost/cached.ts')
  assertEquals(res1.status, 200)
  assertEquals(transformCallCount, 1)

  // Second request to same path - should NOT call transform (served from cache)
  const res2 = await app.request('http://localhost/cached.ts')
  assertEquals(res2.status, 200)
  assertEquals(
    transformCallCount,
    1,
    'transform should not be called for cached path',
  )

  const body1 = await res1.text()
  const body2 = await res2.text()
  assertEquals(body1, body2)
})

Deno.test('postProcess runs after esbuild.transform on every response', async () => {
  const mockEsbuild: EsbuildLike = {
    transform: (input: string | Uint8Array) => {
      const text = typeof input === 'string' ? input : new TextDecoder().decode(input)
      return Promise.resolve({ code: text.replace(': number', '') })
    },
    stop: () => Promise.resolve(),
  }
  let postProcessCalls = 0

  const app = new Hono()
  app.use(
    '*',
    esbuildMiddleware({
      esbuild: mockEsbuild,
      postProcess: (code) => {
        postProcessCalls++
        return `${code}\n//postprocessed`
      },
    }),
  )
  app.use('*', async (c) =>
    await c.body(source, 200, {
      'content-type': 'application/typescript',
      'content-length': String(source.length),
    }))

  const res = await app.request('http://localhost/post.ts')
  assertEquals(res.status, 200)
  assertEquals(postProcessCalls, 1)

  const body = await res.text()
  assertStringIncludes(body, '//postprocessed')
  assertStringIncludes(body, 'export const value = 1;')
})
