/**
 * @module
 * Build-specific flag builder. Validates `BuildOptions`, normalizes
 * entry-points, stdin contents, and node-paths, then emits the CLI flag
 * array plus the side-channel data the transport needs.
 *
 * @see ./types.ts:BuildFlagsResult
 * @see ./transform.ts
 * @see ./push_helpers.ts
 * @see ./normalize.ts
 */
import type * as types from '../types/mod.ts'
import {
  checkForInvalidFlags,
  getFlag,
  mustBeArrayOfStrings,
  mustBeBoolean,
  mustBeEntryPoints,
  mustBeObject,
  mustBeString,
  mustBeStringOrBoolean,
  type OptionKeys,
  validateMangleCache,
} from '../validation.ts'
import { validateAndJoinStringArray, validateStringValue } from '../string_helpers.ts'
import { pushCommonFlags, pushLogFlags } from './push_helpers.ts'
import type { BuildFlagsResult } from './types.ts'
import { normalizeEntryPoints, normalizeNodePaths, normalizeStdin } from './normalize.ts'

/** Builds the CLI flags and reserialized metadata for a `build` call. */
export function flagsForBuildOptions(
  callName: string,
  options: types.BuildOptions,
  isTTY: boolean,
  logLevelDefault: types.LogLevel,
  writeDefault: boolean,
): BuildFlagsResult {
  const flags: string[] = []
  const keys: OptionKeys = Object.create(null)
  pushLogFlags(flags, options, keys, isTTY, logLevelDefault)
  pushCommonFlags(flags, options, keys)

  const sourcemap = getFlag(options, keys, 'sourcemap', mustBeStringOrBoolean)
  const bundle = getFlag(options, keys, 'bundle', mustBeBoolean)
  const splitting = getFlag(options, keys, 'splitting', mustBeBoolean)
  const preserveSymlinks = getFlag(
    options,
    keys,
    'preserveSymlinks',
    mustBeBoolean,
  )
  const metafile = getFlag(options, keys, 'metafile', mustBeBoolean)
  const outfile = getFlag(options, keys, 'outfile', mustBeString)
  const outdir = getFlag(options, keys, 'outdir', mustBeString)
  const outbase = getFlag(options, keys, 'outbase', mustBeString)
  const tsconfig = getFlag(options, keys, 'tsconfig', mustBeString)
  const resolveExtensions = getFlag(
    options,
    keys,
    'resolveExtensions',
    mustBeArrayOfStrings,
  )
  const nodePathsInput = getFlag(
    options,
    keys,
    'nodePaths',
    mustBeArrayOfStrings,
  )
  const mainFields = getFlag(options, keys, 'mainFields', mustBeArrayOfStrings)
  const conditions = getFlag(options, keys, 'conditions', mustBeArrayOfStrings)
  const external = getFlag(options, keys, 'external', mustBeArrayOfStrings)
  const packages = getFlag(options, keys, 'packages', mustBeString)
  const alias = getFlag(options, keys, 'alias', mustBeObject)
  const loader = getFlag(options, keys, 'loader', mustBeObject)
  const outExtension = getFlag(options, keys, 'outExtension', mustBeObject)
  const publicPath = getFlag(options, keys, 'publicPath', mustBeString)
  const entryNames = getFlag(options, keys, 'entryNames', mustBeString)
  const chunkNames = getFlag(options, keys, 'chunkNames', mustBeString)
  const assetNames = getFlag(options, keys, 'assetNames', mustBeString)
  const inject = getFlag(options, keys, 'inject', mustBeArrayOfStrings)
  const banner = getFlag(options, keys, 'banner', mustBeObject)
  const footer = getFlag(options, keys, 'footer', mustBeObject)
  const entryPoints = getFlag(options, keys, 'entryPoints', mustBeEntryPoints)
  const absWorkingDir = getFlag(options, keys, 'absWorkingDir', mustBeString)
  const stdin = getFlag(options, keys, 'stdin', mustBeObject)
  const write = getFlag(options, keys, 'write', mustBeBoolean) ?? writeDefault // Default to true if not specified
  const allowOverwrite = getFlag(
    options,
    keys,
    'allowOverwrite',
    mustBeBoolean,
  )
  const mangleCache = getFlag(options, keys, 'mangleCache', mustBeObject)
  keys.plugins = true // "plugins" has already been read earlier
  checkForInvalidFlags(options, keys, `in ${callName}() call`)

  if (sourcemap) {
    flags.push(`--sourcemap${sourcemap === true ? '' : `=${sourcemap}`}`)
  }
  if (bundle) flags.push('--bundle')
  if (allowOverwrite) flags.push('--allow-overwrite')
  if (splitting) flags.push('--splitting')
  if (preserveSymlinks) flags.push('--preserve-symlinks')
  if (metafile) flags.push(`--metafile`)
  if (outfile) flags.push(`--outfile=${outfile}`)
  if (outdir) flags.push(`--outdir=${outdir}`)
  if (outbase) flags.push(`--outbase=${outbase}`)
  if (tsconfig) flags.push(`--tsconfig=${tsconfig}`)
  if (packages) flags.push(`--packages=${packages}`)
  if (resolveExtensions) {
    flags.push(
      `--resolve-extensions=${validateAndJoinStringArray(resolveExtensions, 'resolve extension')}`,
    )
  }
  if (publicPath) flags.push(`--public-path=${publicPath}`)
  if (entryNames) flags.push(`--entry-names=${entryNames}`)
  if (chunkNames) flags.push(`--chunk-names=${chunkNames}`)
  if (assetNames) flags.push(`--asset-names=${assetNames}`)
  if (mainFields) {
    flags.push(
      `--main-fields=${validateAndJoinStringArray(mainFields, 'main field')}`,
    )
  }
  if (conditions) {
    flags.push(
      `--conditions=${validateAndJoinStringArray(conditions, 'condition')}`,
    )
  }
  if (external) {
    for (const name of external) {
      flags.push(`--external:${validateStringValue(name, 'external')}`)
    }
  }
  if (alias) {
    for (const old in alias) {
      if (old.indexOf('=') >= 0) {
        throw new Error(`Invalid package name in alias: ${old}`)
      }
      flags.push(
        `--alias:${old}=${validateStringValue(alias[old], 'alias', old)}`,
      )
    }
  }
  if (banner) {
    for (const type in banner) {
      if (type.indexOf('=') >= 0) {
        throw new Error(`Invalid banner file type: ${type}`)
      }
      flags.push(
        `--banner:${type}=${validateStringValue(banner[type], 'banner', type)}`,
      )
    }
  }
  if (footer) {
    for (const type in footer) {
      if (type.indexOf('=') >= 0) {
        throw new Error(`Invalid footer file type: ${type}`)
      }
      flags.push(
        `--footer:${type}=${validateStringValue(footer[type], 'footer', type)}`,
      )
    }
  }
  if (inject) {
    for (const path of inject) {
      flags.push(`--inject:${validateStringValue(path, 'inject')}`)
    }
  }
  if (loader) {
    for (const ext in loader) {
      if (ext.indexOf('=') >= 0) {
        throw new Error(`Invalid loader extension: ${ext}`)
      }
      flags.push(
        `--loader:${ext}=${validateStringValue(loader[ext], 'loader', ext)}`,
      )
    }
  }
  if (outExtension) {
    for (const ext in outExtension) {
      if (ext.indexOf('=') >= 0) {
        throw new Error(`Invalid out extension: ${ext}`)
      }
      flags.push(
        `--out-extension:${ext}=${validateStringValue(outExtension[ext], 'out extension', ext)}`,
      )
    }
  }

  const entries = normalizeEntryPoints(entryPoints)
  const [stdinContents, stdinResolveDir] = normalizeStdin(stdin, flags)
  const nodePaths = normalizeNodePaths(nodePathsInput)

  return {
    entries,
    flags,
    write,
    stdinContents,
    stdinResolveDir,
    absWorkingDir,
    nodePaths,
    mangleCache: validateMangleCache(mangleCache),
  }
}
