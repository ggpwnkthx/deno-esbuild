/**
 * @module
 * Single source of truth for the log-level default values used by the
 * `build` and `transform` flag builders. The constants are re-exported via
 * {@link ./mod.ts} and consumed by {@link ./build.ts}, {@link ./transform.ts},
 * and {@link ./push_helpers.ts}.
 */
import type * as types from '../types/mod.ts'

/** Default log level for `build` calls when the caller does not specify one. */
export const buildLogLevelDefault: types.LogLevel = 'warning'

/** Default log level for `transform` calls when the caller does not specify
 * one. */
export const transformLogLevelDefault: types.LogLevel = 'silent'
