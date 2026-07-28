/**
 * @module
 * Transform-specific flag builder. Validates `TransformOptions` and emits
 * the CLI flag array plus the validated mangle cache.
 *
 * @see ./types.ts:TransformFlagsResult
 * @see ./build.ts
 * @see ./push_helpers.ts
 */
import type * as types from '../types/mod.ts'
import {
  checkForInvalidFlags,
  getFlag,
  mustBeObject,
  mustBeString,
  mustBeStringOrBoolean,
  type OptionKeys,
  validateMangleCache,
} from '../validation.ts'
import { pushCommonFlags, pushLogFlags } from './push_helpers.ts'
import type { TransformFlagsResult } from './types.ts'

/** Builds the CLI flags and reserialized metadata for a `transform` call. */
export function flagsForTransformOptions(
  callName: string,
  options: types.TransformOptions,
  isTTY: boolean,
  logLevelDefault: types.LogLevel,
): TransformFlagsResult {
  const flags: string[] = []
  const keys: OptionKeys = Object.create(null)
  pushLogFlags(flags, options, keys, isTTY, logLevelDefault)
  pushCommonFlags(flags, options, keys)

  const sourcemap = getFlag(options, keys, 'sourcemap', mustBeStringOrBoolean)
  const sourcefile = getFlag(options, keys, 'sourcefile', mustBeString)
  const loader = getFlag(options, keys, 'loader', mustBeString)
  const banner = getFlag(options, keys, 'banner', mustBeString)
  const footer = getFlag(options, keys, 'footer', mustBeString)
  const mangleCache = getFlag(options, keys, 'mangleCache', mustBeObject)
  checkForInvalidFlags(options, keys, `in ${callName}() call`)

  if (sourcemap) {
    flags.push(`--sourcemap=${sourcemap === true ? 'external' : sourcemap}`)
  }
  if (sourcefile) flags.push(`--sourcefile=${sourcefile}`)
  if (loader) flags.push(`--loader=${loader}`)
  if (banner) flags.push(`--banner=${banner}`)
  if (footer) flags.push(`--footer=${footer}`)

  return {
    flags,
    mangleCache: validateMangleCache(mangleCache),
  }
}
