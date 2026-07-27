/**
 * Framework-agnostic ordered route dispatcher.
 *
 * Declarative, predicate-based routing: each {@linkcode Route} contributes a
 * `match` predicate and a `handle` response producer. The {@linkcode Router}
 * walks the route list in declaration order and returns the first match's
 * response, falling back to a 404 when nothing matches.
 *
 * The {@linkcode Route} shape is intentionally compatible with both Hono and
 * Oak handlers, so the same route list can dispatch into either framework
 * through a thin adapter without rewriting handler signatures.
 *
 * @example
 * ```ts
 * import { Router, type Route } from "@ggpwnkthx/esbuild-wrapper-shared";
 *
 * const routes: Route[] = [
 *   {
 *     match: (_req, ctx) => ctx.pathname === "/",
 *     handle: () => new Response("hello"),
 *   },
 *   {
 *     match: (_req, ctx) => ctx.pathname.endsWith(".ts"),
 *     handle: async (_req, ctx) => {
 *       const source = await Deno.readTextFile(`.${ctx.pathname}`);
 *       return new Response(source, { headers: { "content-type": "text/javascript" } });
 *     },
 *   },
 * ];
 *
 * const router = new Router(routes);
 * const response = await router.dispatch(new Request("http://localhost/"), {
 *   pathname: "/",
 * });
 * ```
 */
export interface RouteContext {
  /**
   * The decoded request pathname, with the leading slash preserved. Callers
   * are responsible for normalizing the path before passing it to dispatch.
   */
  pathname: string
}

/**
 * Declarative route: a `match` predicate plus a `handle` response producer.
 *
 * Both methods receive the incoming `Request` and a precomputed
 * {@linkcode RouteContext}. `match` may be async; `handle` returns a
 * `Response` (or a `Promise<Response>`).
 */
export interface Route {
  match(req: Request, ctx: RouteContext): boolean | Promise<boolean>
  handle(req: Request, ctx: RouteContext): Response | Promise<Response>
}

/**
 * Ordered predicate-based route dispatcher. Routes are evaluated in
 * declaration order; the first matching route's `handle` produces the
 * response. If no route matches, dispatch returns a 404 with body "not found".
 *
 * The dispatcher is framework-agnostic: it only consumes web-standard
 * `Request` and `Response` types, so it can be embedded behind a Hono
 * middleware or an Oak middleware, or used directly in a `Deno.serve` handler.
 */
export class Router {
  readonly #routes: Route[]

  constructor(routes: Route[]) {
    this.#routes = routes
  }

  /**
   * Walk the route list in order and return the first matching route's
   * response. Falls back to a 404 when no route matches.
   */
  async dispatch(req: Request, ctx: RouteContext): Promise<Response> {
    for (const route of this.#routes) {
      if (await route.match(req, ctx)) {
        return await route.handle(req, ctx)
      }
    }
    return new Response('not found', { status: 404 })
  }
}
