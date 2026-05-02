import type { Middleware } from "@oak/oak";
import {
  DEFAULT_CONTENT_TYPE,
  getCachedOrTranspile,
  Options,
  setErrorResponse,
  setSuccessResponse,
  shouldTranspile,
} from "../shared.ts";

export type { Options };

/**
 * Oak middleware that transforms TypeScript/TSX responses using esbuild.
 *
 * Intended for development servers that serve Deno TypeScript files directly.
 * The middleware intercepts responses with a body, checks if the request path
 * matches `options.extensions`, and transforms the response body using
 * `esbuild.transform` with the `tsx` loader.
 *
 * @param options - Middleware configuration
 * @returns An Oak `Middleware`
 *
 * @example
 * ```ts
 * import { Application } from "@oak/oak";
 * import { esbuild } from "@deno/esbuild";
 * import esbuildMiddleware from "@deno/esbuild/wrappers/oak";
 *
 * const app = new Application();
 * app.use(esbuildMiddleware());
 * app.use(async (ctx) => {
 *   ctx.response.body = `export const value: number = 1;`;
 *   ctx.response.headers.set("content-type", "application/typescript");
 * });
 *
 * export default { fetch: app.handle };
 * ```
 */
export default function (options?: Options): Middleware {
  return async (ctx, next) => {
    await next();
    const url = new URL(ctx.request.url);

    if (!shouldTranspile(url.pathname, options?.extensions)) {
      return;
    }

    const body = await ctx.request.body.text();
    const contentType = options?.contentType ?? DEFAULT_CONTENT_TYPE;

    let code: string;
    try {
      ({ code } = await getCachedOrTranspile({
        pathname: url.pathname,
        body,
        esbuild: options?.esbuild,
        transformOptions: options?.transformOptions,
        cache: options?.cache ?? false,
        shouldStop: !options?.esbuild,
        maxSize: options?.maxSize,
        ttl: options?.ttl,
      }));
    } catch (ex) {
      setErrorResponse("oak", ctx, body, contentType, ex, url.pathname);
      return;
    }

    setSuccessResponse("oak", ctx, code, contentType);
  };
}
