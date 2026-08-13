/**
 * @module
 * Barrel re-export of the shared esbuild transport plumbing. This module
 * mirrors the public surface of the former `shared/common.ts` so that
 * downstream consumers can keep a single import path:
 *
 * ```ts
 * import * as common from "@ggpwnkthx/esbuild/shared";
 * ```
 */
export * from './validation.ts'
export * from './cache_root.ts'
export * from './flags/mod.ts'
export * from './v8_stack.ts'
export {
  failureErrorWithLog,
  replaceDetailsInMessages,
  sanitizeLocation,
  sanitizeMessages,
  sanitizeStringArray,
  sanitizeStringMap,
} from './message_sanitize.ts'
export * from './plugin_runner/mod.ts'
export * from './transport/mod.ts'
