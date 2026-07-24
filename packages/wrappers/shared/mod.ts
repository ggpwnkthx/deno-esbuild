/**
 * Shared utility library for Deno esbuild middleware wrappers.
 *
 * This module provides caching, transpilation, and framework response helpers
 * used by both Hono and Oak wrappers. Use {@linkcode createTranspiler} to
 * build an isolated transpiler per middleware instance; each instance owns its
 * own in-memory cache so multiple servers in the same process do not share
 * state.
 *
 * @example Basic usage
 * ```ts
 * import { createTranspiler, shouldTranspile } from "@ggpwnkthx/esbuild-wrapper-shared";
 *
 * const transpiler = createTranspiler({ cache: true });
 *
 * if (shouldTranspile("/path/to/file.ts")) {
 *   const { code } = await transpiler.getCachedOrTranspile({
 *     pathname: "/path/to/file.ts",
 *     body: "console.log('hello')",
 *   });
 * }
 * ```
 */
import * as esbuild from 'esbuild'

/**
 * Minimal esbuild surface consumed by the wrappers. Lets tests inject a
 * stand-in without having to satisfy the full esbuild module shape.
 */
export interface EsbuildLike {
  transform(
    input: string | Uint8Array,
    options?: esbuild.TransformOptions,
  ): Promise<{ code: string }>
  stop(): Promise<void>
}

/**
 * Cache entry stored for transformed responses.
 */
export interface CacheEntry {
  code: string
  timestamp: number
}

/**
 * Configuration shared by every middleware wrapper.
 */
export interface Options {
  /**
   * File extensions that should be transformed. Only paths ending with one of
   * these extensions will be processed.
   * @default [".ts", ".tsx"]
   */
  extensions?: string[]
  /**
   * Enable caching of transformed responses. When `true`, the middleware may
   * skip re-transforming previously seen responses.
   * @default false
   */
  cache?: boolean
  /**
   * The esbuild API to use for transformation. Defaults to the top-level
   * `esbuild` import. Allows injecting a custom esbuild instance (e.g., WASM).
   */
  esbuild?: EsbuildLike
  /**
   * Value for the `content-type` response header after transformation.
   * @default "text/javascript"
   */
  contentType?: string
  /**
   * Additional options passed to `esbuild.transform()` (e.g., `loader`, `jsx`,
   * `target`, `minify`).
   */
  transformOptions?: esbuild.TransformOptions
  /**
   * Maximum number of entries in the cache. When exceeded, the oldest entry
   * is evicted. Defaults to undefined (unlimited).
   */
  maxSize?: number
  /**
   * Time-to-live for cache entries in milliseconds. When exceeded, the entry
   * is considered stale and evicted on the next access. Defaults to undefined (no expiry).
   */
  ttl?: number
}

/** Default file extensions that should be transpiled. */
export const DEFAULT_EXTENSIONS = ['.ts', '.tsx']
/** Default Content-Type for transformed JavaScript responses. */
export const DEFAULT_CONTENT_TYPE = 'text/javascript'

/**
 * Check if a pathname should be transpiled based on file extensions.
 */
export function shouldTranspile(
  pathname: string,
  extensions?: string[],
): boolean {
  const exts = extensions ?? DEFAULT_EXTENSIONS
  return exts.some((ext) => pathname.endsWith(ext))
}

/** Options accepted by {@linkcode createTranspiler}. */
export interface TranspilerOptions {
  cache?: boolean | undefined
  esbuild?: EsbuildLike | undefined
  transformOptions?: esbuild.TransformOptions | undefined
  maxSize?: number | undefined
  ttl?: number | undefined
}

/** Per-request options for {@linkcode Transpiler.getCachedOrTranspile}. */
export interface TranspileRequest {
  pathname: string
  body: string
  /**
   * When true (default), calls `esbuild.stop()` after transformation.
   * Set to false when using an injected esbuild instance (e.g., WASM)
   * that should not be stopped.
   */
  shouldStop?: boolean
}

/** A transpiler bound to a single in-memory cache. */
export interface Transpiler {
  getCachedOrTranspile(opts: TranspileRequest): Promise<{ code: string }>
  clearCache(): void
}

/**
 * Create an isolated transpiler that owns its own cache.
 */
export function createTranspiler(options: TranspilerOptions = {}): Transpiler {
  const cache: Map<string, CacheEntry> = new Map()
  const cacheEnabled = options.cache === true
  const esbuildInstance = options.esbuild ?? esbuild
  const transformOptions = options.transformOptions
  const effectiveMaxSize = typeof options.maxSize === 'number' &&
      Number.isFinite(options.maxSize) && options.maxSize > 0
    ? options.maxSize
    : undefined
  const effectiveTtl = typeof options.ttl === 'number' &&
      Number.isFinite(options.ttl) && options.ttl >= 0
    ? options.ttl
    : undefined

  return {
    async getCachedOrTranspile({ pathname, body, shouldStop = true }: TranspileRequest) {
      if (cacheEnabled) {
        const cached = cache.get(pathname)
        if (cached !== undefined) {
          if (
            effectiveTtl !== undefined &&
            Date.now() - cached.timestamp >= effectiveTtl
          ) {
            cache.delete(pathname)
          } else {
            return { code: cached.code }
          }
        }
      }

      const mergedOptions = transformOptions ?? {}
      const { code } = await esbuildInstance.transform(body, {
        ...mergedOptions,
        loader: mergedOptions.loader ?? 'tsx',
      })

      if (shouldStop) {
        await esbuildInstance.stop()
      }

      if (cacheEnabled) {
        if (effectiveMaxSize !== undefined && cache.size >= effectiveMaxSize) {
          let oldestKey: string | null = null
          let oldestTimestamp = Infinity
          for (const [key, entry] of cache) {
            if (entry.timestamp < oldestTimestamp) {
              oldestKey = key
              oldestTimestamp = entry.timestamp
            }
          }
          if (oldestKey !== null) {
            cache.delete(oldestKey)
          }
        }
        cache.set(pathname, { code, timestamp: Date.now() })
      }

      return { code }
    },
    clearCache() {
      cache.clear()
    },
  }
}

/**
 * Set a successful transpiled response on the framework context.
 */
export function setSuccessResponse(
  framework: 'hono' | 'oak',
  ctx: unknown,
  code: string,
  contentType: string,
): void {
  if (framework === 'hono') {
    const c = ctx as {
      body: (b: string) => Response
      res: Response
    }
    c.res = c.body(code)
    c.res.headers.set('content-type', contentType)
    c.res.headers.delete('content-length')
  } else {
    const c = ctx as {
      response: {
        body: string
        headers: {
          set: (k: string, v: string) => void
          delete: (k: string) => void
        }
      }
    }
    c.response.body = code
    c.response.headers.set('content-type', contentType)
    c.response.headers.delete('content-length')
  }
}

/**
 * Set an error response on the framework context.
 */
export function setErrorResponse(
  framework: 'hono' | 'oak',
  ctx: unknown,
  originalBody: string,
  contentType: string,
  ex: unknown,
  pathname: string,
): void {
  console.warn('Error transpiling ' + pathname + ': ' + ex)

  if (framework === 'hono') {
    const c = ctx as {
      body: (b: string) => Response
      res: Response
    }
    c.res = c.body(originalBody)
    c.res.headers.set('content-type', contentType)
    c.res.headers.delete('content-length')
  } else {
    const c = ctx as {
      response: {
        body: string
        headers: {
          set: (k: string, v: string) => void
          delete: (k: string) => void
        }
      }
    }
    c.response.body = originalBody
    c.response.headers.set('content-type', contentType)
    c.response.headers.delete('content-length')
  }
}
