/**
 * @module
 * Public transport surface: the stream-shaped contract that the native
 * (`mod.ts`) and WASM (`wasm.ts`) entry points adapt to. The implementation
 * is split across the sibling modules in this directory:
 *
 * - {@link ./version.ts} — `ESBUILD_VERSION` constant.
 * - {@link ./types.ts} — `StreamIn`, `StreamOut`, `StreamFS`,
 *   `Refs`, `StreamService`, `Service`, `ServiceEnv`, `defaultTransformFs`.
 * - {@link ./service.ts} — `createService` Promise wrapper factory.
 * - {@link ./sync_stubs.ts} — `SyncStubs`, `createSyncStubs`.
 * - {@link ./channel.ts} — `createChannel` stdio packet channel with
 *   internal `readFromStdout` / `afterClose` / `sendRequest` /
 *   `sendResponse` helpers.
 * - {@link ./build_context.ts} — `buildOrContextImpl` higher-level builder
 *   for the `build` / `context` calls (and the nested `BuildContext`
 *   lifecycle for `rebuild` / `watch` / `serve` / `cancel` / `dispose`).
 * - {@link ./util.ts} — `convertOutputFiles`, `parseJSON`.
 *
 * This barrel keeps the historical `./transport.ts` import path resolving
 * to the same public surface.
 */
export { ESBUILD_VERSION } from './version.ts'
export type {
  Refs,
  Service,
  ServiceEnv,
  StreamFS,
  StreamIn,
  StreamOut,
  StreamService,
} from './types.ts'
export { defaultTransformFs } from './types.ts'
export { createService } from './service.ts'
export type { SyncStubs } from './sync_stubs.ts'
export { createSyncStubs } from './sync_stubs.ts'
export { createChannel } from './channel.ts'
export { buildOrContextImpl } from './build_context.ts'
export { convertOutputFiles, parseJSON } from './util.ts'
export { type RuntimeKind, validateInitializeOptions } from '../validation.ts'
