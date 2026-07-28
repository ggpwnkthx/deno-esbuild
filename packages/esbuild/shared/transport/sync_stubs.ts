/**
 * @module
 * Synchronous-API stubs used by both transports. Deno lacks the synchronous
 * stdin/stdout access these APIs require, so they all throw on call.
 *
 * @see ./types.ts
 */
import type * as types from '../types/mod.ts'

/**
 * The set of synchronous esbuild APIs that are not supported in Deno (because
 * Deno lacks the synchronous stdin/stdout access they require). Both
 * transports re-export these from {@link createSyncStubs}.
 */
export interface SyncStubs {
  /** Synchronous `build` stub that throws on call. */
  buildSync: typeof types.buildSync
  /** Synchronous `transform` stub that throws on call. */
  transformSync: typeof types.transformSync
  /** Synchronous `formatMessages` stub that throws on call. */
  formatMessagesSync: typeof types.formatMessagesSync
  /** Synchronous `analyzeMetafile` stub that throws on call. */
  analyzeMetafileSync: typeof types.analyzeMetafileSync
}

/**
 * Builds the four synchronous esbuild stubs that throw on call. They share
 * the exact same error message format as the upstream esbuild API.
 */
export function createSyncStubs(): SyncStubs {
  const throwing = (name: string): () => never => {
    return () => {
      throw new Error(`The "${name}" API does not work in Deno`)
    }
  }
  return {
    buildSync: throwing('buildSync'),
    transformSync: throwing('transformSync'),
    formatMessagesSync: throwing('formatMessagesSync'),
    analyzeMetafileSync: throwing('analyzeMetafileSync'),
  }
}
