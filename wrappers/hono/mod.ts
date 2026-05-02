import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
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
 * Hono middleware that transforms TypeScript/TSX responses using esbuild.
 *
 * Intended for development servers that serve Deno TypeScript files directly.
 * The middleware intercepts responses with a body, checks if the request path
 * matches `options.extensions`, and transforms the response body using
 * `esbuild.transform` with the `tsx` loader.
 *
 * @param options - Middleware configuration
 * @returns A Hono `MiddlewareHandler`
 *
 * @example
 * ```ts
 * import { Hono } from "hono";
 * import { esbuild } from "@deno/esbuild";
 * import denoEsbuild from "@deno/esbuild/wrappers/hono";
 *
 * const app = new Hono();
 * app.use(denoEsbuild({ extensions: [".ts", ".tsx"] }));
 * app.get("/", (c) => c.text("Hello from Deno!"));
 *
 * export default { fetch: app.fetch };
 * ```
 */
export default (options?: Options): MiddlewareHandler => {
  return createMiddleware(async (c, next) => {
    await next();
    const url = new URL(c.req.url);

    if (!shouldTranspile(url.pathname, options?.extensions)) {
      return;
    }

    const body = await c.res.text();
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
      setErrorResponse("hono", c, body, contentType, ex, url.pathname);
      return;
    }

    setSuccessResponse("hono", c, code, contentType);
  });
};
