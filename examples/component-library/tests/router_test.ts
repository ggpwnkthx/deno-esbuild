import { assertEquals } from '@std/assert'
import { Router } from '@ggpwnkthx/esbuild-wrapper-shared'

Deno.test('Router dispatches to the first matching route in declaration order', async () => {
  const calls: string[] = []
  const router = new Router([
    {
      match: () => {
        calls.push('a:match')
        return true
      },
      handle: () => {
        calls.push('a:handle')
        return new Response('a')
      },
    },
    {
      match: () => {
        calls.push('b:match')
        return true
      },
      handle: () => {
        calls.push('b:handle')
        return new Response('b')
      },
    },
  ])

  const response = await router.dispatch(new Request('http://localhost/'), { pathname: '/' })
  assertEquals(await response.text(), 'a')
  assertEquals(calls, ['a:match', 'a:handle'])
})

Deno.test('Router falls through to the next route when match returns false', async () => {
  const calls: string[] = []
  const router = new Router([
    {
      match: () => {
        calls.push('a:match')
        return false
      },
      handle: () => {
        calls.push('a:handle')
        return new Response('a')
      },
    },
    {
      match: () => {
        calls.push('b:match')
        return true
      },
      handle: () => {
        calls.push('b:handle')
        return new Response('b')
      },
    },
  ])

  const response = await router.dispatch(new Request('http://localhost/'), { pathname: '/' })
  assertEquals(await response.text(), 'b')
  assertEquals(calls, ['a:match', 'b:match', 'b:handle'])
})

Deno.test('Router returns a 404 when no route matches', async () => {
  const router = new Router([])
  const response = await router.dispatch(new Request('http://localhost/'), { pathname: '/' })
  assertEquals(response.status, 404)
})
