import { assertEquals } from '@std/assert'
import { type Route, Router } from '../mod.ts'

Deno.test('Router - dispatches to the first matching route in declaration order', async () => {
  const calls: string[] = []
  const routes: Route[] = [
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
  ]
  const router = new Router(routes)

  const response = await router.dispatch(new Request('http://localhost/'), { pathname: '/' })

  assertEquals(await response.text(), 'a')
  assertEquals(calls, ['a:match', 'a:handle'])
})

Deno.test('Router - falls through to the next route when match returns false', async () => {
  const calls: string[] = []
  const routes: Route[] = [
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
  ]
  const router = new Router(routes)

  const response = await router.dispatch(new Request('http://localhost/'), { pathname: '/' })

  assertEquals(await response.text(), 'b')
  assertEquals(calls, ['a:match', 'b:match', 'b:handle'])
})

Deno.test('Router - returns 404 when no route matches', async () => {
  const router = new Router([])
  const response = await router.dispatch(new Request('http://localhost/'), { pathname: '/' })

  assertEquals(response.status, 404)
  assertEquals(await response.text(), 'not found')
})

Deno.test('Router - awaits async match predicates', async () => {
  const router = new Router([
    {
      match: async (_req, ctx) => {
        await Promise.resolve()
        return ctx.pathname === '/async'
      },
      handle: () => new Response('async-ok'),
    },
  ])
  const response = await router.dispatch(new Request('http://localhost/async'), {
    pathname: '/async',
  })
  assertEquals(await response.text(), 'async-ok')
})

Deno.test('Router - shape is compatible with both Hono and Oak handlers', () => {
  const honoStyle: Route = {
    match: (c, ctx) => c.url === `http://localhost${ctx.pathname}`,
    handle: (c) => new Response(c.url),
  }
  const oakStyle: Route = {
    match: (req, ctx) => req.headers.get('x-test') === ctx.pathname,
    handle: (req) => new Response(req.headers.get('x-test') ?? ''),
  }
  assertEquals(typeof honoStyle.match, 'function')
  assertEquals(typeof oakStyle.handle, 'function')
})
