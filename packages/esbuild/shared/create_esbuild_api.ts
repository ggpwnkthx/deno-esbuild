/**
 * @module
 * Factory that wires the lazy-init service and the sync stubs into the
 * public esbuild API surface.
 *
 * Both `mod.ts` (native-binary transport) and `wasm.ts` (browser/WASM
 * transport) call {@link createEsbuildApi} with their own
 * `ensureService` thunk and obtain the same `build`, `context`, `transform`,
 * `formatMessages`, `analyzeMetafile`, `initialize`, `stop`, and four
 * `*Sync` stubs. Differences between the two transports are confined to
 * the `EnsureService` and `runtime` arguments.
 */
import type * as types from './types.ts'
import { type RuntimeKind, validateInitializeOptions } from './validation.ts'
import type { Service, SyncStubs } from './transport.ts'

/**
 * Inputs needed to construct the public esbuild API surface.
 *
 * - `ensureService`: returns the running service; may start it on first
 *   call. Multiple concurrent callers must share the same promise.
 * - `syncStubs`: the four `*Sync` stubs to expose. Most code calls
 *   {@link createSyncStubs}.
 * - `runtime`: discriminator passed to `validateInitializeOptions`.
 * - `stop`: the user-visible `stop()` function.
 * - `onValidate`: optional hook fired inside `initialize` after the
 *   options are validated. The hook receives the normalized options so
 *   transports that need them (e.g. WASM, which uses `wasmURL` and
 *   `useWorker`) can capture them before `ensureService` runs.
 */
export interface CreateEsbuildApiOptions {
  ensureService: () => Promise<Service>
  syncStubs: SyncStubs
  runtime: RuntimeKind
  stop: () => Promise<void>
  onValidate?: (options: types.InitializeOptions) => void
}

/** The public API surface produced by {@link createEsbuildApi}. */
export interface EsbuildApi {
  build: typeof types.build
  context: typeof types.context
  transform: typeof types.transform
  formatMessages: typeof types.formatMessages
  analyzeMetafile: typeof types.analyzeMetafile
  buildSync: typeof types.buildSync
  transformSync: typeof types.transformSync
  formatMessagesSync: typeof types.formatMessagesSync
  analyzeMetafileSync: typeof types.analyzeMetafileSync
  initialize: typeof types.initialize
  stop: () => Promise<void>
}

/**
 * Builds the public esbuild API surface from a lazy-init service thunk and
 * the synchronous stubs. The factory was extracted from the per-transport
 * `mod.ts` and `wasm.ts` files, which used to redundantly wire the five
 * async exports and the four sync stubs. They now share this single helper.
 */
export function createEsbuildApi(deps: CreateEsbuildApiOptions): EsbuildApi {
  const { ensureService, syncStubs, runtime, stop } = deps
  return {
    build: (options) => ensureService().then((s) => s.build(options)),
    context: (options) => ensureService().then((s) => s.context(options)),
    transform: (input, options) => ensureService().then((s) => s.transform(input, options)),
    formatMessages: (messages, options) =>
      ensureService().then((s) => s.formatMessages(messages, options)),
    analyzeMetafile: (metafile, options) =>
      ensureService().then((s) => s.analyzeMetafile(metafile, options)),
    buildSync: syncStubs.buildSync,
    transformSync: syncStubs.transformSync,
    formatMessagesSync: syncStubs.formatMessagesSync,
    analyzeMetafileSync: syncStubs.analyzeMetafileSync,
    initialize: async (options) => {
      const validated = validateInitializeOptions(options || {}, runtime)
      if (deps.onValidate) deps.onValidate(validated)
      await ensureService()
    },
    stop,
  }
}
