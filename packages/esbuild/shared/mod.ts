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
export * from './flags.ts'
export * from './v8_stack.ts'
export {
  failureErrorWithLog,
  type ObjectStashLike as MessageObjectStashLike,
  replaceDetailsInMessages,
  sanitizeLocation,
  sanitizeMessages,
  sanitizeStringArray,
  sanitizeStringMap,
} from './message_sanitize.ts'
export * from './plugin_runner.ts'
export * from './transport.ts'
