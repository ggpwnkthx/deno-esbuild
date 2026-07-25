import { MediaType } from '@deno/loader'

/**
 * Media types that should be emitted as raw bytes (no transpilation, no
 * rewriting of content). Their import paths in JS source are still rewritten
 * to point at the emitted sibling file.
 */
const ASSET_MEDIA_TYPES: ReadonlySet<MediaType> = new Set<MediaType>([
  MediaType.Wasm,
  MediaType.Json,
  MediaType.SourceMap,
])

/**
 * Media types that are NOT transpiled to JS but ARE emitted as files (with
 * their original extension preserved when possible, or `.css`/`.html`).
 * CSS is parsed for `@import` and `url(...)` rewrites in a follow-up pass.
 */
const PASSTHROUGH_MEDIA_TYPES: ReadonlySet<MediaType> = new Set<MediaType>([
  MediaType.Css,
  MediaType.Html,
  MediaType.Sql,
])

export function isAssetMediaType(type: MediaType): boolean {
  return ASSET_MEDIA_TYPES.has(type)
}

export function isPassthroughMediaType(type: MediaType): boolean {
  return PASSTHROUGH_MEDIA_TYPES.has(type)
}

/**
 * Pick the output filename for an asset whose specifier was mapped via
 * `path.relativePathFor`. By default the basename produced by `relativePathFor`
 * already has `.js`; we restore the original extension so consumers' runtime
 * resolve-by-URL keeps working.
 */
export function assetOutputName(
  specifier: string,
  defaultRelative: string,
): string {
  // Preserve the original extension from the source URL.
  try {
    const u = new URL(specifier)
    const pathname = u.pathname
    const dot = pathname.lastIndexOf('.')
    if (dot === -1 || dot < pathname.lastIndexOf('/')) return defaultRelative
    const ext = pathname.slice(dot) // includes the dot
    const base = defaultRelative.replace(/\.js$/, '')
    return base + ext
  } catch {
    return defaultRelative
  }
}
