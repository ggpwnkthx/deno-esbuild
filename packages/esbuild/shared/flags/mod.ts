/**
 * @module
 * Builders that convert `BuildOptions` and `TransformOptions` into the
 * CLI-style flag arrays the esbuild service consumes over the wire.
 *
 * The implementation is split across the sibling modules in this directory:
 * - {@link ./defaults.ts} — log-level default values.
 * - {@link ./types.ts} — `BuildFlagsResult` / `TransformFlagsResult`.
 * - {@link ./push_helpers.ts} — `pushLogFlags` and `pushCommonFlags`.
 * - {@link ./build.ts} — `flagsForBuildOptions`.
 * - {@link ./transform.ts} — `flagsForTransformOptions`.
 *
 * This barrel keeps the historical `./flags.ts` import path resolving to
 * the same public surface.
 */
export type { BuildFlagsResult, TransformFlagsResult } from './types.ts'
export { flagsForBuildOptions } from './build.ts'
export { flagsForTransformOptions } from './transform.ts'
export { pushLogFlags } from './push_helpers.ts'

import { buildLogLevelDefault, transformLogLevelDefault } from './defaults.ts'
import type * as types from '../types/mod.ts'

/** Default log level used by `build` calls when none is supplied. */
export const buildLogLevelDefaultValue: types.LogLevel = buildLogLevelDefault
/** Default log level used by `transform` calls when none is supplied. */
export const transformLogLevelDefaultValue: types.LogLevel = transformLogLevelDefault
