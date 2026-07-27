import * as path from '@std/path'

const SYNTHETIC_REFERRER = '.deno-resolver-referrer'

function syntheticReferrer(workspaceRoot: string): string {
  return path.toFileUrl(path.join(workspaceRoot, SYNTHETIC_REFERRER)).toString()
}

function looksManagedPath(importerPath: string): boolean {
  return importerPath.includes('/node_modules/') || importerPath.includes('/deno/')
}

/**
 * Pick the effective importer URL to pass to the Deno loader.
 *
 * If the importer is outside the workspace root we substitute a synthetic
 * referrer inside the workspace so the import map is applied. Remote URLs and
 * importers inside a managed package location (Deno's npm cache, the built-in
 * deps cache, or a user-side node_modules tree) are passed through unchanged.
 */
export function resolveImporter(
  importerUrl: string | undefined,
  workspaceRoot: string | undefined,
): string | undefined {
  if (!workspaceRoot) return importerUrl
  if (!importerUrl) return syntheticReferrer(workspaceRoot)

  // Remote URLs (https://, jsr://, npm://, etc.) must be passed through so the
  // resolver resolves relative imports within the remote package.
  if (!importerUrl.startsWith('file://') && !importerUrl.startsWith('/')) {
    return importerUrl
  }

  const importerPath = importerUrl.startsWith('file://')
    ? path.fromFileUrl(importerUrl)
    : importerUrl

  if (importerPath.startsWith(workspaceRoot)) return importerUrl

  // Pass through importers inside a managed package location. Substituting
  // those to a synthetic workspace referrer causes relative require() calls
  // inside CJS source — such as `module.exports = require('./sibling')` in an
  // npm CJS entry — to resolve against the workspace path instead of the
  // package's own directory, which makes esbuild's CJS-to-ESM conversion emit
  // import paths for files that do not exist where the substituted referrer
  // points.
  if (looksManagedPath(importerPath)) return importerUrl

  return syntheticReferrer(workspaceRoot)
}
