/**
 * Main entrypoint for the `@ggpwnkthx/esbuild-wrapper-oak` package.
 *
 * Exports an Oak middleware that on-the-fly transpiles TypeScript/TSX
 * responses using esbuild. Intended for development servers that serve
 * Deno TypeScript files directly without a separate build step.
 *
 * @example
 * ```ts
 * import { Application } from "@oak/oak";
 * import esbuildMiddleware from "@ggpwnkthx/esbuild-wrapper-oak";
 *
 * const app = new Application();
 * app.use(esbuildMiddleware());
 * app.use((ctx) => {
 *   ctx.response.body = `export const value: number = 1;`;
 *   ctx.response.headers.set("content-type", "application/typescript");
 * });
 *
 * export default { fetch: app.handle };
 * ```
 */
import type { Middleware } from '@oak/oak'
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
 * Oak middleware that transforms TypeScript/TSX responses using esbuild.
 *
 * Intended for development servers that serve Deno TypeScript files directly.
 * The middleware runs after downstream handlers, checks if the request path
 * matches `options.extensions`, reads `ctx.response.body`, and transforms it
 * using `esbuild.transform` with the `tsx` loader. This mirrors the Hono
 * wrapper's behavior so both wrappers consume the same response-body
 * contract.
 *
 * @param options - Middleware configuration
 * @returns An Oak `Middleware`
 *
 * @example
 * ```ts
 * import { Application } from "@oak/oak";
 * import esbuildMiddleware from "@ggpwnkthx/esbuild-wrapper-oak";
 *
 * const app = new Application();
 * app.use(esbuildMiddleware());
 * app.use((ctx) => {
 *   ctx.response.body = `export const value: number = 1;`;
 *   ctx.response.headers.set("content-type", "application/typescript");
 * });
 *
 * export default { fetch: app.handle };
 * ```
 */
export default function (options?: Options): Middleware {
  const transpiler = createTranspiler({
    cache: options?.cache,
    esbuild: options?.esbuild,
    transformOptions: options?.transformOptions,
    maxSize: options?.maxSize,
    ttl: options?.ttl,
  })

  return async (ctx, next) => {
    await next()
    const url = new URL(ctx.request.url)

    if (!shouldTranspile(url.pathname, options?.extensions)) {
      return
    }

    const body = await readResponseBody(ctx)
    const contentType = options?.contentType ?? DEFAULT_CONTENT_TYPE

    let code: string
    try {
      ;({ code } = await transpiler.getCachedOrTranspile({
        pathname: url.pathname,
        body,
        shouldStop: !options?.esbuild,
      }))
    } catch (ex) {
      setErrorResponse('oak', ctx, body, contentType, ex, url.pathname)
      return
    }

    setSuccessResponse('oak', ctx, code, contentType)
  }
}

async function readResponseBody(
  ctx: { response: { body: unknown } },
): Promise<string> {
  const body = ctx.response.body
  if (typeof body === 'string') return body
  if (body instanceof Uint8Array) return new TextDecoder().decode(body)
  if (body instanceof ReadableStream) {
    return await new Response(body).text()
  }
  return ''
}
