import type * as esbuild from 'esbuild'
import { MediaType, RequestedModuleType } from '@deno/loader'
import type { WorkspaceOptions } from '@deno/loader'

const MEDIA_TO_LOADER: ReadonlyMap<MediaType, esbuild.Loader> = new Map([
  [MediaType.Jsx, 'jsx'],
  [MediaType.JavaScript, 'js'],
  [MediaType.Mjs, 'js'],
  [MediaType.Cjs, 'js'],
  [MediaType.TypeScript, 'ts'],
  [MediaType.Mts, 'ts'],
  [MediaType.Dmts, 'ts'],
  [MediaType.Dcts, 'ts'],
  [MediaType.Tsx, 'tsx'],
  [MediaType.Css, 'css'],
  [MediaType.Json, 'json'],
  [MediaType.Html, 'default'],
  [MediaType.Sql, 'default'],
  [MediaType.Wasm, 'binary'],
  [MediaType.SourceMap, 'json'],
  [MediaType.Unknown, 'default'],
])

/**
 * Converts a media type to an esbuild loader identifier.
 */
export function mediaToLoader(type: MediaType): esbuild.Loader {
  return MEDIA_TO_LOADER.get(type) ?? 'default'
}

const PLATFORM_MAP: ReadonlyMap<esbuild.Platform, WorkspaceOptions['platform']> = new Map(
  [
    ['browser', 'browser'],
    ['node', 'node'],
  ],
)

/**
 * Maps an esbuild platform option to a workspace platform option.
 */
export function getPlatform(
  platform: esbuild.Platform | undefined,
): WorkspaceOptions['platform'] {
  if (platform === undefined) return undefined
  return PLATFORM_MAP.get(platform)
}

const URL_PREFIX_RE = /^(?:https?|npm|jsr|file):/

/**
 * Returns true when the specifier looks like a URL with a known scheme prefix
 * (`http:`, `https:`, `npm:`, `jsr:`, `file:`).
 */
export function hasUrlScheme(specifier: string): boolean {
  return URL_PREFIX_RE.test(specifier)
}

const SCHEME_TO_NAMESPACE: ReadonlyMap<string, string> = new Map([
  ['file:', 'file'],
  ['http:', 'http'],
  ['https:', 'https'],
  ['npm:', 'npm'],
  ['jsr:', 'jsr'],
])

/**
 * Returns the esbuild namespace for a resolved URL, or `undefined` if the
 * scheme is not handled by this plugin.
 */
export function schemeToNamespace(resolved: string): string | undefined {
  for (const prefix of SCHEME_TO_NAMESPACE.keys()) {
    if (resolved.startsWith(prefix)) return SCHEME_TO_NAMESPACE.get(prefix)
  }
  return undefined
}

/**
 * Determines the requested module type based on file extension and arguments.
 */
export function getModuleType(
  file: string,
  withArgs: Record<string, string>,
): RequestedModuleType {
  switch (withArgs.type) {
    case 'text':
      return RequestedModuleType.Text
    case 'bytes':
      return RequestedModuleType.Bytes
    case 'json':
      return RequestedModuleType.Json
    default:
      if (file.endsWith('.json')) {
        return RequestedModuleType.Json
      }
      return RequestedModuleType.Default
  }
}

// For some reason esbuild passes external specifiers to plugins.
// See: https://esbuild.github.io/api/#external
/**
 * Converts an external specifier pattern to a RegExp for matching.
 */
export function externalToRegex(external: string): RegExp {
  // Note: * becomes .* which matches across path separators (e.g. "foo/*" matches "foo/bar/baz").
  // This aligns with esbuild's external pattern behaviour where * is a greedy glob.
  return new RegExp(
    '^' + external.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(
      /\*/g,
      '.*',
    ) + '$',
  )
}
