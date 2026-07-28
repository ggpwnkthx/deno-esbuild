/**
 * @module
 * Service-level wire-protocol request and response DTOs exchanged with the
 * esbuild Go service. Pure type declarations — no runtime emission.
 *
 * This module covers the service-level commands (`build`, `rebuild`,
 * `dispose`, `cancel`, `watch`, `serve`, `transform`, `format-msgs`,
 * `analyze-metafile`, `ping`). The plugin-callback commands (`on-start`,
 * `on-resolve`, `on-load`, `serve-request`) live in {@link ./plugin_messages.ts}.
 *
 * @see ./../packet.ts
 * @see ./plugin_messages.ts
 * @see ../../types.ts
 */
import type * as types from '../types/mod.ts'

/** Request to run a build. */
export interface BuildRequest {
  /** Wire-protocol discriminator. */
  command: 'build'
  /** Build-key registered by the host to scope callback routing. */
  key: number
  /** Resolved entry-point pairs (output, input) in declaration order. */
  entries: [string, string][] // Use an array instead of a map to preserve order
  /** CLI flags string. */
  flags: string[]
  /** Whether the service should write output files to disk. */
  write: boolean
  /** Optional stdin payload when no real entry point exists. */
  stdinContents: Uint8Array | null
  /** Resolve directory for `stdinContents`. */
  stdinResolveDir: string | null
  /** Override for the build's working directory. */
  absWorkingDir: string
  /** Value to set as `NODE_PATH` for the service child. */
  nodePaths: string[]
  /** Whether the build should yield a long-lived `BuildContext`. */
  context: boolean
  /** Plugin tree to register with the service. */
  plugins?: BuildPlugin[]
  /** Mangle cache to seed the service with. */
  mangleCache?: Record<string, string | false>
}

/** Request to start a dev server. */
export interface ServeRequest {
  /** Wire-protocol discriminator. */
  command: 'serve'
  /** Build-key registered by the host to scope callback routing. */
  key: number
  /** Whether the host registered an `onRequest` callback. */
  onRequest: boolean
  /** TCP port to bind to. */
  port?: number
  /** Hostname or IP address to bind to. */
  host?: string
  /** Directory of static files to serve alongside the bundled output. */
  servedir?: string
  /** Path to the TLS private key. */
  keyfile?: string
  /** Path to the TLS certificate. */
  certfile?: string
  /** Fallback HTML path served when the requested path is not found. */
  fallback?: string
  /** Allowed CORS `Origin` values. */
  corsOrigin?: string[]
}

/** Response from a serve request. */
export interface ServeResponse {
  /** TCP port the dev server is bound to. */
  port: number
  /** Hostnames the dev server can be reached on. */
  hosts: string[]
}

/** Plugin registration data embedded in a build request. */
export interface BuildPlugin {
  /** Plugin name shown in messages. */
  name: string
  /** Whether the plugin registered an `onStart` callback. */
  onStart: boolean
  /** Whether the plugin registered an `onEnd` callback. */
  onEnd: boolean
  /** Registered `onResolve` filters, keyed by callback id. */
  onResolve: { id: number; filter: string; namespace: string }[]
  /** Registered `onLoad` filters, keyed by callback id. */
  onLoad: { id: number; filter: string; namespace: string }[]
}

/** Response from a completed build. */
export interface BuildResponse {
  /** Errors surfaced during the build. */
  errors: types.Message[]
  /** Warnings surfaced during the build. */
  warnings: types.Message[]
  /** Output files (only present when `write: false`). */
  outputFiles?: BuildOutputFile[]
  /** Serialized metafile JSON (only present when `metafile: true`). */
  metafile?: Uint8Array
  /** Updated mangle cache to round-trip back to the host. */
  mangleCache?: Record<string, string | false>
  /** Bytes the service wrote to stdout that the host should print. */
  writeToStdout?: Uint8Array
}

/** Request signalling the end of a build (watch/serve). */
export interface OnEndRequest extends BuildResponse {
  /** Wire-protocol discriminator. */
  command: 'on-end'
}

/** Response to an on-end request. */
export interface OnEndResponse {
  /** Errors reported by `onEnd` plugins. */
  errors: types.Message[]
  /** Warnings reported by `onEnd` plugins. */
  warnings: types.Message[]
}

/** A single output file from a build. */
export interface BuildOutputFile {
  /** Absolute path of the generated output file. */
  path: string
  /** Raw bytes of the generated output file. */
  contents: Uint8Array
  /** Content hash for cache-busting query strings. */
  hash: string
}

/** A keep-alive ping. */
export interface PingRequest {
  /** Wire-protocol discriminator. */
  command: 'ping'
}

/** Request to trigger a rebuild. */
export interface RebuildRequest {
  /** Wire-protocol discriminator. */
  command: 'rebuild'
  /** Build-key identifying the context to rebuild. */
  key: number
}

/** Response from a rebuild. */
export interface RebuildResponse {
  /** Errors surfaced during the rebuild. */
  errors: types.Message[]
  /** Warnings surfaced during the rebuild. */
  warnings: types.Message[]
}

/** Request to dispose a build context. */
export interface DisposeRequest {
  /** Wire-protocol discriminator. */
  command: 'dispose'
  /** Build-key identifying the context to dispose. */
  key: number
}

/** Request to cancel an in-flight build. */
export interface CancelRequest {
  /** Wire-protocol discriminator. */
  command: 'cancel'
  /** Build-key identifying the build to cancel. */
  key: number
}

/** Request to start file watching. */
export interface WatchRequest {
  /** Wire-protocol discriminator. */
  command: 'watch'
  /** Build-key identifying the context to watch. */
  key: number
  /** Throttle delay between rebuilds, in milliseconds. */
  delay?: number
}

/** Request to run a transform. */
export interface TransformRequest {
  /** Wire-protocol discriminator. */
  command: 'transform'
  /** CLI flags string. */
  flags: string[]
  /** Either the source bytes or a path to a temp file containing them. */
  input: Uint8Array
  /** True when `input` is a path rather than inline bytes. */
  inputFS: boolean
  /** Mangle cache to seed the service with. */
  mangleCache?: Record<string, string | false>
}

/** Response from a transform. */
export interface TransformResponse {
  /** Errors surfaced during the transform. */
  errors: types.Message[]
  /** Warnings surfaced during the transform. */
  warnings: types.Message[]

  /** Transformed source code. */
  code: string
  /** Whether `code` is a path to a file the host should read. */
  codeFS: boolean

  /** Source map string. */
  map: string
  /** Whether `map` is a path to a file the host should read. */
  mapFS: boolean

  /** External file of legal comments, when `legalComments: "external"`. */
  legalComments?: string
  /** Updated mangle cache to round-trip back to the host. */
  mangleCache?: Record<string, string | false>
}

/** Request to resolve a module path. The shape of the request that triggers
 * the `onResolve` chain; the resolved value is captured by
 * {@link ResolveResponse}. Re-exported from {@link ./plugin_messages.ts} for
 * back-compat with the historical import path. */
export type { ResolveRequest, ResolveResponse } from './plugin_messages.ts'
