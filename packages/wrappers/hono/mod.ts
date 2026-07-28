/**
 * Hono middleware that on-the-fly transpiles TypeScript/TSX responses using esbuild.
 *
 * This is the main entrypoint for the `@ggpwnkthx/esbuild-wrapper-hono` package.
 * It intercepts responses, checks if the request path matches configured
 * `extensions`, and transforms the response body using `esbuild.transform`
 * with the `tsx` loader.
 *
 * @example
 * ```ts
 * import { Hono } from "hono";
 * import esbuildMiddleware from "@ggpwnkthx/esbuild-wrapper-hono";
 *
 * const app = new Hono();
 * app.use(esbuildMiddleware({ extensions: [".ts", ".tsx"] }));
 * app.get("/", (c) => c.text("Hello from Deno!"));
 *
 * export default { fetch: app.fetch };
 * ```
 */
import type { MiddlewareHandler } from 'hono'
import { createMiddleware } from 'hono/factory'
import {
  createTranspiler,
  DEFAULT_CONTENT_TYPE,
  type Options,
  setErrorResponse,
  setSuccessResponse,
  shouldTranspile,
} from '@ggpwnkthx/esbuild-wrapper-shared'

export type { Options }

/**
 * Hono middleware that transforms TypeScript/TSX responses using esbuild.
 *
 * Intended for development servers that serve Deno TypeScript files directly.
 * The middleware runs after downstream handlers, checks if the request path
 * matches `options.extensions`, reads the response body, and transforms it
 * using `esbuild.transform` with the `tsx` loader.
 *
 * @param options - Middleware configuration
 * @returns A Hono `MiddlewareHandler`
 *
 * @example
 * ```ts
 * import { Hono } from "hono";
 * import esbuildMiddleware from "@ggpwnkthx/esbuild-wrapper-hono";
 *
 * const app = new Hono();
 * app.use(esbuildMiddleware({ extensions: [".ts", ".tsx"] }));
 * app.get("/", (c) => c.text("Hello from Deno!"));
 *
 * export default { fetch: app.fetch };
 * ```
 */
export default (options?: Options): MiddlewareHandler => {
  const transpiler = createTranspiler({
    cache: options?.cache,
    esbuild: options?.esbuild,
    transformOptions: options?.transformOptions,
    maxSize: options?.maxSize,
    ttl: options?.ttl,
    postProcess: options?.postProcess,
  })

  return createMiddleware(async (c, next) => {
    await next()
    const url = new URL(c.req.url)

    if (!shouldTranspile(url.pathname, options?.extensions)) {
      return
    }

    const body = await c.res.text()
    const contentType = options?.contentType ?? DEFAULT_CONTENT_TYPE

    let code: string
    try {
      ;({ code } = await transpiler.getCachedOrTranspile({
        pathname: url.pathname,
        body,
        shouldStop: !options?.esbuild,
        postProcess: options?.postProcess,
      }))
    } catch (ex) {
      setErrorResponse('hono', c, body, contentType, ex, url.pathname)
      return
    }

    setSuccessResponse('hono', c, code, contentType)
  })
}
