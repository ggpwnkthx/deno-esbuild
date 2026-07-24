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
import { ESBUILD_VERSION } from './shared/common.ts'

const RELEASE_BASE_URL =
  `https://github.com/ggpwnkthx/deno-esbuild/releases/download/v${ESBUILD_VERSION}`

interface ReleaseBinary {
  assetName: string
}

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
 * Uses `~/Library/Caches` on macOS, `%LOCALAPPDATA%\Cache` (or `%USERPROFILE%`)
 * on Windows, and `$XDG_CACHE_HOME` (or `~/.cache`) on Linux.
 */
function getCachePath(assetName: string): {
  finalPath: string
  finalDir: string
} {
  let baseDir: string | undefined

  switch (Deno.build.os) {
    case 'darwin':
      baseDir = Deno.env.get('HOME')
      if (baseDir) baseDir += '/Library/Caches'
      break

    case 'windows':
      baseDir = Deno.env.get('LOCALAPPDATA')
      if (!baseDir) {
        baseDir = Deno.env.get('USERPROFILE')
        if (baseDir) baseDir += '/AppData/Local'
      }
      if (baseDir) baseDir += '/Cache'
      break

    case 'linux': {
      const xdg = Deno.env.get('XDG_CACHE_HOME')
      if (xdg && xdg[0] === '/') baseDir = xdg
      break
    }
  }

  if (!baseDir) {
    baseDir = Deno.env.get('HOME')
    if (baseDir) baseDir += '/.cache'
  }

  if (!baseDir) throw new Error('Failed to find cache directory')

  const finalDir = `${baseDir}/esbuild/bin`
  const finalPath = `${finalDir}/${assetName}@${ESBUILD_VERSION}`
  return { finalPath, finalDir }
}

/**
 * Downloads (when not cached) and verifies the platform esbuild binary. The
 * downloaded bytes are checked against the matching entry in `SHA256SUMS`
 * before being placed in the cache.
 */
async function installFromRelease(assetName: string): Promise<string> {
  const { finalPath, finalDir } = getCachePath(assetName)

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

const knownReleaseAssets: Record<string, ReleaseBinary> = {
  // Deno-supported platforms
  'aarch64-apple-darwin': { assetName: 'esbuild-darwin-arm64' },
  'x86_64-apple-darwin': { assetName: 'esbuild-darwin-x64' },
  'aarch64-unknown-linux-gnu': { assetName: 'esbuild-linux-arm64' },
  'x86_64-unknown-linux-gnu': { assetName: 'esbuild-linux-x64' },
  'x86_64-pc-windows-msvc': { assetName: 'esbuild-win32-x64.exe' },

  // Extra release assets, kept for compatibility if Deno exposes these targets
  'aarch64-pc-windows-msvc': { assetName: 'esbuild-win32-arm64.exe' },
  'aarch64-linux-android': { assetName: 'esbuild-android-arm64' },
  'x86_64-unknown-freebsd': { assetName: 'esbuild-freebsd-x64' },
  'aarch64-unknown-freebsd': { assetName: 'esbuild-freebsd-arm64' },
  'x86_64-alpine-linux-musl': { assetName: 'esbuild-linux-x64' },
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
  const releaseBinary = knownReleaseAssets[platformKey]
  if (!releaseBinary) {
    throw new Error(`Unsupported platform: ${platformKey}`)
  }

  return await installFromRelease(releaseBinary.assetName)
}
