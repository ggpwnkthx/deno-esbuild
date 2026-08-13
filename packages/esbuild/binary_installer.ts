/**
 * @module
 * Native-binary installer for the `@ggpwnkthx/esbuild` package.
 *
 * This module owns the single responsibility of locating or downloading the
 * upstream esbuild binary for the current platform, verifying it against the
 * release `SHA256SUMS` file, and caching it under the platform's user cache
 * directory. It is consumed by {@link ../mod.ts} only — the WASM transport
 * does not need it.
 *
 * Public surface:
 * - `install()`: returns an absolute path to a usable esbuild binary, either
 *   from `ESBUILD_BINARY_PATH` (when set), the platform cache, or by
 *   downloading the matching release asset.
 *
 * @see ../mod.ts
 */
import * as path from '@std/path'
import { ESBUILD_VERSION } from './shared/mod.ts'
import { getDenoCacheBase } from './shared/cache_root.ts'

/** Base URL of the GitHub release that hosts the esbuild binaries. */
const RELEASE_BASE_URL =
  `https://github.com/ggpwnkthx/deno-esbuild/releases/download/v${ESBUILD_VERSION}`

/** Whether {@link fetchChecked} should return the body as bytes or text. */
type FetchKind = 'bytes' | 'text'

/**
 * Fetches the given URL and returns either UTF-8 decoded text or raw bytes.
 * Throws if the HTTP response is not OK; the error message names the asset so
 * the failure is diagnosable from the stack trace alone.
 */
async function fetchChecked<K extends FetchKind>(
  url: string,
  name: string,
  kind: K,
): Promise<K extends 'bytes' ? Uint8Array : string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to download ${name}: HTTP ${response.status} ${response.statusText}`,
    )
  }
  return (kind === 'bytes'
    ? new Uint8Array(await response.arrayBuffer())
    : await response.text()) as K extends 'bytes' ? Uint8Array : string
}

/** Computes the lowercase hex SHA-256 digest of `bytes`. */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes)
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer)

  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('')
}

/**
 * Parses a `sha256sum`-style checksum file and returns the expected digest
 * for `assetName`. Tolerates both the standard format
 * (`<hex><spaces><file>`) and the `sha256:<hex> <file>` prefix used by some
 * release tooling.
 */
function findExpectedSHA256(checksumText: string, assetName: string): string {
  for (const line of checksumText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // Standard sha256sum format: <64-hex-digest><spaces>FILENAME
    const match = /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(trimmed)
    if (match && match[2] === assetName) {
      return match[1]!.toLowerCase()
    }

    // Also tolerate: sha256:<64-hex-digest> FILENAME
    const alternate = /^sha256:([a-fA-F0-9]{64})\s+(.+)$/.exec(trimmed)
    if (alternate && alternate[2] === assetName) {
      return alternate[1]!.toLowerCase()
    }
  }

  throw new Error(`Could not find SHA-256 checksum for ${assetName}`)
}

/**
 * Resolves the absolute cache path for `assetName` on the current platform.
 *
 * Precedence:
 *   1. `ESBUILD_CACHE_DIR` env var (directory override; the asset file
 *      is appended as `<dir>/esbuild/bin/<assetName>@<version>`, matching
 *      the layout used by the platform default).
 *   2. Sibling of Deno's cache root, computed by {@link getDenoCacheBase}.
 *      The base is the parent of Deno's managed cache, so the esbuild binary
 *      ends up alongside — never inside — Deno's `node_modules`/remote-cache
 *      tree.
 *   3. Throws if neither resolves.
 */
function getCachePath(assetName: string): string {
  const override = Deno.env.get('ESBUILD_CACHE_DIR')
  if (override) {
    return path.join(override, 'esbuild', 'bin', `${assetName}@${ESBUILD_VERSION}`)
  }

  const base = getDenoCacheBase()
  if (!base) {
    throw new Error(
      'Could not determine esbuild cache directory: set ESBUILD_CACHE_DIR or DENO_DIR',
    )
  }
  return path.join(base, 'esbuild', 'bin', `${assetName}@${ESBUILD_VERSION}`)
}

/**
 * Downloads (when not cached) and verifies the platform esbuild binary. The
 * downloaded bytes are checked against the matching entry in `SHA256SUMS`
 * before being placed in the cache.
 */
async function installFromRelease(assetName: string): Promise<string> {
  const finalPath = getCachePath(assetName)
  const finalDir = path.dirname(finalPath)

  try {
    await Deno.stat(finalPath)
    return finalPath
  } catch {
    // Cache miss, download below
  }

  const assetURL = `${RELEASE_BASE_URL}/${assetName}`
  const sumsURL = `${RELEASE_BASE_URL}/SHA256SUMS`

  const [executable, checksumText] = await Promise.all([
    fetchChecked(assetURL, assetName, 'bytes'),
    fetchChecked(sumsURL, 'SHA256SUMS', 'text'),
  ])

  const expectedHash = findExpectedSHA256(checksumText, assetName)
  const actualHash = await sha256Hex(executable)

  if (actualHash !== expectedHash) {
    throw new Error(
      `Checksum mismatch for ${assetName}: expected ${expectedHash}, got ${actualHash}`,
    )
  }

  await Deno.mkdir(finalDir, {
    recursive: true,
    mode: 0o700,
  })

  const tempPath = `${finalPath}.${crypto.randomUUID()}.tmp`

  try {
    await Deno.writeFile(tempPath, executable, { mode: 0o755 })
    if (Deno.build.os !== 'windows') await Deno.chmod(tempPath, 0o755)
    await Deno.rename(tempPath, finalPath)
  } catch (err) {
    try {
      await Deno.remove(tempPath)
    } catch {
      // Ignore cleanup errors
    }
    throw err
  }

  return finalPath
}

/** Static map of `Deno.build.target` strings to the esbuild release asset
 * name for that platform. May be augmented at runtime via
 * {@link registerPlatform}. */
const platformAssetRegistry = new Map<string, string>([
  // Deno-supported platforms
  ['aarch64-apple-darwin', 'esbuild-darwin-arm64'],
  ['x86_64-apple-darwin', 'esbuild-darwin-x64'],
  ['aarch64-unknown-linux-gnu', 'esbuild-linux-arm64'],
  ['x86_64-unknown-linux-gnu', 'esbuild-linux-x64'],
  ['x86_64-pc-windows-msvc', 'esbuild-win32-x64.exe'],

  // Extra release assets, kept for compatibility if Deno exposes these targets
  ['aarch64-pc-windows-msvc', 'esbuild-win32-arm64.exe'],
  ['aarch64-linux-android', 'esbuild-android-arm64'],
  ['x86_64-unknown-freebsd', 'esbuild-freebsd-x64'],
  ['aarch64-unknown-freebsd', 'esbuild-freebsd-arm64'],
  ['x86_64-alpine-linux-musl', 'esbuild-linux-x64'],
])

/**
 * Registers a custom platform-to-asset mapping. Embedders (wasmer, deno
 * deploy, custom CI distros) can call this at startup to point esbuild at
 * a custom release asset without forking the package.
 *
 * Re-registering the same `name` silently overrides the previous mapping.
 * Calling this after `install()` has already resolved the current platform
 * does not affect the already-resolved path; the new mapping is used on
 * the next call to `install()`.
 */
export function registerPlatform(name: string, assetName: string): void {
  platformAssetRegistry.set(name, assetName)
}

/**
 * Removes a custom platform registration. Primarily useful for tests that
 * need to reset module-level state between cases.
 *
 * Returns `true` if the mapping was present, `false` otherwise.
 */
export function unregisterPlatform(name: string): boolean {
  return platformAssetRegistry.delete(name)
}

/**
 * Returns the list of currently registered platform keys. Useful for
 * diagnostics and tests; the order is implementation-defined.
 */
export function knownPlatforms(): string[] {
  return [...platformAssetRegistry.keys()]
}

/**
 * Locates or downloads the esbuild binary for the current platform and returns
 * an absolute path to a verified executable.
 *
 * Order of resolution:
 * 1. The `ESBUILD_BINARY_PATH` environment variable, when set.
 * 2. The platform-specific cache directory (reused across runs).
 * 3. A fresh download from the package's GitHub release, verified against
 *    `SHA256SUMS` before being added to the cache.
 */
export async function install(): Promise<string> {
  const overridePath = Deno.env.get('ESBUILD_BINARY_PATH')
  if (overridePath) return overridePath

  const platformKey = Deno.build.target
  const assetName = platformAssetRegistry.get(platformKey)
  if (!assetName) {
    throw new Error(`Unsupported platform: ${platformKey}`)
  }

  return await installFromRelease(assetName)
}
