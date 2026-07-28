/**
 * @module
 * Plugin-callback wire-protocol DTOs exchanged with the esbuild Go service.
 * Pure type declarations — no runtime emission.
 *
 * Covers the service-bound callbacks (`on-start`, `on-resolve`, `on-load`,
 * `serve-request`). The host-bound module-path resolution command lives
 * in {@link ./messages.ts}.
 *
 * @see ./messages.ts
 * @see ../../plugin_runner.ts
 * @see ../types.ts
 */
import type * as types from '../types/mod.ts'

/** Request for a plugin onStart callback. */
export interface OnStartRequest {
  /** Wire-protocol discriminator. */
  command: 'on-start'
  /** Build-key identifying the build receiving the callback. */
  key: number
}

/** Response to an on-start request. */
export interface OnStartResponse {
  /** Errors collected from `onStart` callbacks. */
  errors?: types.PartialMessage[]
  /** Warnings collected from `onStart` callbacks. */
  warnings?: types.PartialMessage[]
}

/** Request for a plugin onResolve callback. */
export interface OnResolveRequest {
  /** Wire-protocol discriminator. */
  command: 'on-resolve'
  /** Build-key identifying the build receiving the callback. */
  key: number
  /** Candidate callback ids to try in order. */
  ids: number[]
  /** Import path the resolve callback was triggered for. */
  path: string
  /** Importer path that issued the import. */
  importer: string
  /** Loader namespace the import originated from. */
  namespace: string
  /** Directory used to resolve relative paths. */
  resolveDir: string
  /** Kind of import that triggered the resolve call. */
  kind: types.ImportKind
  /** Lookup id for `pluginData` in the host's object stash. */
  pluginData: number
  /** Import attributes (e.g. `{ type: "json" }`). */
  with: Record<string, string>
}

/** Response to an on-resolve request. */
export interface OnResolveResponse {
  /** Id of the callback that handled the request. */
  id?: number
  /** Name of the plugin claiming the resolved path. */
  pluginName?: string

  /** Errors surfaced during the plugin's resolve. */
  errors?: types.PartialMessage[]
  /** Warnings surfaced during the plugin's resolve. */
  warnings?: types.PartialMessage[]

  /** Resolved path produced by the plugin. */
  path?: string
  /** Whether the resolved path should be treated as external. */
  external?: boolean
  /** Whether the module has side effects (used for tree shaking). */
  sideEffects?: boolean
  /** Loader namespace the resolved path belongs to. */
  namespace?: string
  /** Suffix appended to the resolved path (e.g. `?query`). */
  suffix?: string
  /** Lookup id for the outgoing `pluginData` in the host's object stash. */
  pluginData?: number

  /** Additional files to watch alongside the build. */
  watchFiles?: string[]
  /** Additional directories to watch alongside the build. */
  watchDirs?: string[]
}

/** Request for a plugin onLoad callback. */
export interface OnLoadRequest {
  /** Wire-protocol discriminator. */
  command: 'on-load'
  /** Build-key identifying the build receiving the callback. */
  key: number
  /** Candidate callback ids to try in order. */
  ids: number[]
  /** Path the load callback was triggered for. */
  path: string
  /** Loader namespace the path belongs to. */
  namespace: string
  /** Suffix appended to the path (e.g. `?query`). */
  suffix: string
  /** Lookup id for `pluginData` in the host's object stash. */
  pluginData: number
  /** Import attributes (e.g. `{ type: "json" }`). */
  with: Record<string, string>
}

/** Response to an on-load request. */
export interface OnLoadResponse {
  /** Id of the callback that handled the request. */
  id?: number
  /** Name of the plugin claiming the loaded content. */
  pluginName?: string

  /** Errors surfaced during the plugin's load. */
  errors?: types.PartialMessage[]
  /** Warnings surfaced during the plugin's load. */
  warnings?: types.PartialMessage[]

  /** Module contents to feed back into esbuild. */
  contents?: Uint8Array
  /** Directory used to resolve relative paths inside `contents`. */
  resolveDir?: string
  /** Loader used to interpret `contents`. */
  loader?: string
  /** Lookup id for the outgoing `pluginData` in the host's object stash. */
  pluginData?: number

  /** Additional files to watch alongside the build. */
  watchFiles?: string[]
  /** Additional directories to watch alongside the build. */
  watchDirs?: string[]
}

/** Request for a serve event callback. */
export interface OnServeRequest {
  /** Wire-protocol discriminator. */
  command: 'serve-request'
  /** Build-key identifying the serving context. */
  key: number
  /** Details about the incoming HTTP request. */
  args: types.ServeOnRequestArgs
}

/** Request to resolve a module path. The service-bound resolve command sent
 * before the `onResolve` plugin chain runs. */
export interface ResolveRequest {
  /** Wire-protocol discriminator. */
  command: 'resolve'
  /** Build-key identifying the build receiving the resolve. */
  key: number
  /** Path to resolve. */
  path: string
  /** Name of the plugin initiating the resolve. */
  pluginName: string
  /** Importer path used as the relative base. */
  importer?: string
  /** Loader namespace to resolve inside. */
  namespace?: string
  /** Directory used to resolve relative paths. */
  resolveDir?: string
  /** Kind of import that triggered the resolve. */
  kind?: string
  /** Lookup id for `pluginData` in the host's object stash. */
  pluginData?: number
  /** Import attributes (e.g. `{ type: "json" }`). */
  with?: Record<string, string>
}

/** Response with resolved module info. */
export interface ResolveResponse {
  /** Errors surfaced during the resolve. */
  errors: types.Message[]
  /** Warnings surfaced during the resolve. */
  warnings: types.Message[]

  /** Resolved path. */
  path: string
  /** Whether the resolved path should be treated as external. */
  external: boolean
  /** Whether the module has side effects (used for tree shaking). */
  sideEffects: boolean
  /** Loader namespace the resolved path belongs to. */
  namespace: string
  /** Suffix appended to the resolved path (e.g. `?query`). */
  suffix: string
  /** Lookup id for the outgoing `pluginData` in the host's object stash. */
  pluginData: number
}
