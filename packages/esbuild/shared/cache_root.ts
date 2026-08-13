/**
 * @module
 * Resolves the parent directory of Deno's managed cache root, mirroring the
 * algorithm the `deno` CLI uses to populate `deno info` output.
 *
 * Precedence matches `cli/util/paths.rs` in `denoland/deno`:
 *   1. `DENO_DIR` env var → its parent directory
 *   2. Platform default base directory:
 *      - macOS:   `$HOME/Library/Caches`
 *      - Windows: `%LOCALAPPDATA%` (fallback `%USERPROFILE%/AppData/Local`),
 *                 with `Cache` appended
 *      - Linux / other POSIX: `$XDG_CACHE_HOME` when absolute, else `$HOME/.cache`
 *
 * Returns `undefined` when no usable base can be determined (sandboxed
 * runtime with no `HOME` / `LOCALAPPDATA` / `USERPROFILE`).
 *
 * @see https://docs.deno.com/runtime/reference/cli/info/
 */
import * as path from '@std/path'

/**
 * Resolves the parent directory of Deno's managed cache root, mirroring the
 * algorithm the `deno` CLI uses to populate `deno info` output.
 *
 * Precedence (matches `cli/util/paths.rs` in `denoland/deno`):
 *   1. `DENO_DIR` env var → its parent directory.
 *   2. Platform default base directory:
 *      - macOS:           `$HOME/Library/Caches`
 *      - Windows:         `%LOCALAPPDATA%` (fallback `%USERPROFILE%/AppData/Local`)
 *                         with `Cache` appended
 *      - Linux / POSIX:   `$XDG_CACHE_HOME` when absolute, else `$HOME/.cache`
 *
 * Returns `undefined` when no usable base can be determined (sandboxed
 * runtime with no `HOME` / `LOCALAPPDATA` / `USERPROFILE`).
 *
 * Consumed by `getCachePath` in {@link ../binary_installer.ts} to compute the
 * cache directory as a sibling of Deno's managed cache. Re-exported from
 * {@link ./mod.ts} as part of the shared barrel.
 *
 * @returns Absolute directory path, or `undefined` when no resolution exists.
 * @see https://docs.deno.com/runtime/reference/cli/info/
 */
export function getDenoCacheBase(): string | undefined {
  const override = Deno.env.get('DENO_DIR')
  if (override) return path.dirname(override)

  const home = Deno.env.get('HOME')

  switch (Deno.build.os) {
    case 'darwin':
      return home ? path.join(home, 'Library', 'Caches') : undefined

    case 'windows': {
      let base = Deno.env.get('LOCALAPPDATA')
      if (!base) {
        const profile = Deno.env.get('USERPROFILE')
        if (profile) base = path.join(profile, 'AppData', 'Local')
      }
      return base ? path.join(base, 'Cache') : undefined
    }

    case 'linux': {
      const xdg = Deno.env.get('XDG_CACHE_HOME')
      if (xdg && path.isAbsolute(xdg)) return xdg
      return home ? path.join(home, '.cache') : undefined
    }

    default:
      // freebsd, netbsd, android, and other POSIX targets.
      return home ? path.join(home, '.cache') : undefined
  }
}
