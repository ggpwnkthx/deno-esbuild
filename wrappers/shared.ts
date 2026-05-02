import * as esbuild from "esbuild";

/**
 * Cache entry stored for transformed responses.
 */
export interface CacheEntry {
  code: string;
  timestamp: number;
}

/**
 * In-memory cache for transformed responses, keyed by pathname.
 */
export const responseCache = new Map<string, CacheEntry>();

/**
 * Options for the Deno esbuild middleware.
 */
interface Options {
  /**
   * File extensions that should be transformed. Only paths ending with one of
   * these extensions will be processed.
   * @default [".ts", ".tsx"]
   */
  extensions?: string[];
  /**
   * Enable caching of transformed responses. When `true`, the middleware may
   * skip re-transforming previously seen responses.
   * @default false
   */
  cache?: boolean;
  /**
   * The esbuild API to use for transformation. Defaults to the top-level
   * `esbuild` import. Allows injecting a custom esbuild instance (e.g., WASM).
   */
  esbuild?: typeof esbuild;
  /**
   * Value for the `content-type` response header after transformation.
   * @default "text/javascript"
   */
  contentType?: string;
  /**
   * Additional options passed to `esbuild.transform()` (e.g., `loader`, `jsx`,
   * `target`, `minify`).
   */
  transformOptions?: esbuild.TransformOptions;
  /**
   * Maximum number of entries in the cache. When exceeded, the oldest entry
   * is evicted. Defaults to undefined (unlimited).
   */
  maxSize?: number;
  /**
   * Time-to-live for cache entries in milliseconds. When exceeded, the entry
   * is considered stale and evicted on the next access. Defaults to undefined (no expiry).
   */
  ttl?: number;
}

export type { Options };

/** Default file extensions that should be transpiled. */
export const DEFAULT_EXTENSIONS = [".ts", ".tsx"];
/** Default Content-Type for transformed JavaScript responses. */
export const DEFAULT_CONTENT_TYPE = "text/javascript";

/**
 * Check if a pathname should be transpiled based on file extensions.
 */
export function shouldTranspile(pathname: string, extensions?: string[]): boolean {
  const exts = extensions ?? DEFAULT_EXTENSIONS;
  return exts.some((ext) => pathname.endsWith(ext));
}

/** Options for the transpile-with-cache operation. */
export interface TranspileOptions {
  pathname: string;
  body: string;
  /**
   * The esbuild API to use for transformation. Defaults to the top-level
   * `esbuild` import.
   */
  esbuild?: typeof esbuild;
  transformOptions: esbuild.TransformOptions | undefined;
  cache: boolean;
  /**
   * When true (default), calls `esbuild.stop()` after transformation.
   * Set to false when using an injected esbuild instance (e.g., WASM)
   * that should not be stopped.
   */
  shouldStop: boolean;
  maxSize?: number;
  ttl?: number;
}

/**
 * Get cached transpiled code or transpile and cache the result.
 */
export async function getCachedOrTranspile(opts: TranspileOptions): Promise<{
  code: string;
}> {
  const {
    pathname,
    body,
    esbuild: esbuildInstance,
    transformOptions,
    cache,
    shouldStop,
    maxSize,
    ttl,
  } = opts;

  // Normalize cache options — reject invalid values
  const effectiveMaxSize =
    maxSize !== undefined && Number.isFinite(maxSize) && maxSize > 0
      ? maxSize
      : undefined;
  const effectiveTtl = ttl !== undefined && Number.isFinite(ttl) && ttl >= 0
    ? ttl
    : undefined;

  if (cache) {
    const cached = responseCache.get(pathname);
    if (cached !== undefined) {
      if (effectiveTtl !== undefined && Date.now() - cached.timestamp >= effectiveTtl) {
        responseCache.delete(pathname);
      } else {
        return { code: cached.code };
      }
    }
  }

  const mergedOptions = transformOptions ?? {};
  const esbuildToUse = esbuildInstance ?? esbuild;

  const { code } = await esbuildToUse.transform(body, {
    ...mergedOptions,
    loader: mergedOptions.loader ?? "tsx",
  });

  if (shouldStop) {
    await esbuildToUse.stop();
  }

  if (cache) {
    if (effectiveMaxSize !== undefined && responseCache.size >= effectiveMaxSize) {
      let oldestKey: string | null = null;
      let oldestTimestamp = Infinity;
      for (const [key, entry] of responseCache) {
        if (entry.timestamp < oldestTimestamp) {
          oldestKey = key;
          oldestTimestamp = entry.timestamp;
        }
      }
      if (oldestKey !== null) {
        responseCache.delete(oldestKey);
      }
    }
    responseCache.set(pathname, { code, timestamp: Date.now() });
  }

  return { code };
}

/**
 * Set a successful transpiled response on the framework context.
 */
export function setSuccessResponse(
  framework: "hono" | "oak",
  ctx: unknown,
  code: string,
  contentType: string,
): void {
  if (framework === "hono") {
    // Hono's c.body() is a context method that returns a Response object
    // We need to replace c.res with the new Response, then update its headers
    const c = ctx as {
      body: (b: string) => Response;
      res: Response;
    };
    c.res = c.body(code);
    c.res.headers.set("content-type", contentType);
    c.res.headers.delete("content-length");
  } else {
    const c = ctx as {
      response: {
        body: string;
        headers: { set: (k: string, v: string) => void; delete: (k: string) => void };
      };
    };
    c.response.body = code;
    c.response.headers.set("content-type", contentType);
    c.response.headers.delete("content-length");
  }
}

/**
 * Set an error response on the framework context.
 */
export function setErrorResponse(
  framework: "hono" | "oak",
  ctx: unknown,
  originalBody: string,
  contentType: string,
  ex: unknown,
  pathname: string,
): void {
  console.warn("Error transpiling " + pathname + ": " + ex);

  if (framework === "hono") {
    const c = ctx as {
      body: (b: string) => Response;
      res: Response;
    };
    c.res = c.body(originalBody);
    c.res.headers.set("content-type", contentType);
    c.res.headers.delete("content-length");
  } else {
    const c = ctx as {
      response: {
        body: string;
        headers: { set: (k: string, v: string) => void; delete: (k: string) => void };
      };
    };
    c.response.body = originalBody;
    c.response.headers.set("content-type", contentType);
    c.response.headers.delete("content-length");
  }
}
