/**
 * @module
 * Dev-server types: `ServeOptions`, `CORSOptions`, `ServeOnRequestArgs`,
 * `ServeResult`.
 *
 * @see ./build.ts
 * @see https://esbuild.github.io/api/#serve-arguments
 */

/** Documentation: https://esbuild.github.io/api/#serve-arguments */
export interface ServeOptions {
  /** TCP port the dev server should listen on. */
  port?: number
  /** Hostname or IP address to bind to. */
  host?: string
  /** Directory of static files to serve alongside the bundled output. */
  servedir?: string
  /** Path to the TLS private key file. */
  keyfile?: string
  /** Path to the TLS certificate file. */
  certfile?: string
  /** Fallback HTML file served when the requested path is not found. */
  fallback?: string
  /** CORS configuration for the dev server. */
  cors?: CORSOptions
  /** Callback fired for every incoming HTTP request. */
  onRequest?: (args: ServeOnRequestArgs) => void
}

/** Documentation: https://esbuild.github.io/api/#cors */
export interface CORSOptions {
  /** Allowed `Origin` header value(s); strings or a list of strings. */
  origin?: string | string[]
}

/**
 * Information about an individual request served by the dev server.
 *
 * @see https://esbuild.github.io/api/#serve-arguments
 */
export interface ServeOnRequestArgs {
  /** Client IP address reported for the request. */
  remoteAddress: string
  /** HTTP method (e.g. `"GET"`, `"POST"`). */
  method: string
  /** Request path, including the leading slash. */
  path: string
  /** HTTP status code the server responded with. */
  status: number
  /** The time to generate the response, not to send it */
  timeInMS: number
}

/** Documentation: https://esbuild.github.io/api/#serve-return-values */
export interface ServeResult {
  /** TCP port the dev server is bound to. */
  port: number
  /** Hostname(s) the dev server can be reached on. */
  hosts: string[]
}
