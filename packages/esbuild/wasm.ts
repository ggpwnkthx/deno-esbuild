/**
 * @module
 * Browser/WASM entrypoint for the `@ggpwnkthx/esbuild` package, providing the
 * same async API as mod.ts but using the WebAssembly version of esbuild running
 * in a browser worker by default.
 *
 * All standard esbuild build functions are available, including `build`,
 * `context`, `transform`, `formatMessages`, `analyzeMetafile`, `initialize`,
 * and `stop`. Sync variants (e.g., `buildSync`, `transformSync`) are not
 * supported and throw errors.
 *
 * The `initialize()` function must be called before other API calls in the
 * browser to load the WebAssembly module.
 *
 * @see ./mod
 * @example
 * ```ts
 * import { initialize, build } from "@ggpwnkthx/esbuild/wasm";
 *
 * await initialize({
 *   worker: true,
 *   wasmURL: new URL("./esbuild.wasm", import.meta.url),
 * });
 *
 * const result = await build({
 *   entryPoints: ["src/index.ts"],
 *   outfile: "dist/bundle.js",
 *   bundle: true,
 * });
 * ```
 */
import type * as types from './shared/types/mod.ts'
import type { GoWasmRuntimeHandle, WorkerInputMessage } from './shared/worker/mod.ts'
import * as common from './shared/mod.ts'
import * as ourselves from './wasm.ts'
import { version } from './mod.ts'
import { createEsbuildApi } from './shared/create_esbuild_api.ts'
import type { EsbuildApi } from './shared/create_esbuild_api.ts'

/** Subset of the `MessageEvent` shape the WASM worker uses. */
interface WorkerMessageEvent {
  readonly data: unknown
}

/** Minimal worker interface used by the WASM transport. Concrete
 * implementations are either a real `Worker` or an in-thread polyfill. */
interface WorkerLike {
  postMessage(message: WorkerInputMessage): void
  terminate(): void
  onmessage: ((event: WorkerMessageEvent) => void) | null
  onerror?: ((event: ErrorEvent) => void) | null
}

/** The esbuild binary version string (e.g. "0.28.1"). @see ../mod.ts */
export { version }

/** Promise that resolves to the started service. Undefined until the
 * first API call triggers service startup. */
let initializePromise: Promise<common.Service> | undefined
/** Stop function invoked by the public `stop()` API. Undefined until the
 * service has been started. */
let stopService: (() => void) | undefined
/** Set to `true` by the `initialize()` hook so we only accept a single
 * `initialize()` call per process. */
let hasInitialized = false

/**
 * The most recent validated `initialize` options. The factory's `initialize`
 * validates options and then calls `ensureService`, which kicks off the
 * WASM-specific startup using these captured values.
 */
let currentWasmOptions: types.InitializeOptions = {}

/** Starts the WASM service: spins up a worker (or main-thread runner) and
 * resolves once the WASM module is ready to serve requests. */
const startRunningService = async (
  options: types.InitializeOptions,
): Promise<common.Service> => {
  const { wasmURL, wasmModule, worker = true } = options
  const useWorker = worker !== false
  let workerInstance: WorkerLike

  if (useWorker) {
    // Run esbuild off the main thread.
    const nativeWorker = new Worker(
      new URL('./shared/worker/entry.ts', import.meta.url).href,
      { type: 'module' },
    )

    const workerAdapter: WorkerLike = {
      onmessage: null,
      onerror: null,

      postMessage(message) {
        nativeWorker.postMessage(message)
      },

      terminate() {
        nativeWorker.terminate()
      },
    }

    nativeWorker.onmessage = (event: MessageEvent<unknown>) => {
      workerAdapter.onmessage?.({ data: event.data })
    }

    nativeWorker.onerror = (event: ErrorEvent) => {
      workerAdapter.onerror?.(event)
    }

    workerInstance = workerAdapter
  } else {
    // Run esbuild on the current thread.
    const { createWorkerMessageHandler } = await import('./shared/worker/mod.ts')
    let go: GoWasmRuntimeHandle | undefined
    const onmessage = createWorkerMessageHandler((data) => {
      workerInstance.onmessage?.({ data })
    })

    workerInstance = {
      onmessage: null,
      postMessage: (data) => {
        setTimeout(() => {
          go = onmessage({ data })
        })
      },
      terminate() {
        if (!go) return
        for (const timeout of go._scheduledTimeouts.values()) {
          clearTimeout(timeout)
        }
      },
    }
  }

  let firstMessageResolve!: () => void
  let firstMessageReject!: (error: Error) => void

  const firstMessagePromise = new Promise<void>((resolve, reject) => {
    firstMessageResolve = resolve
    firstMessageReject = reject
  })

  workerInstance.onmessage = ({ data: error }) => {
    workerInstance.onmessage = ({ data }) => {
      if (data instanceof Uint8Array) {
        readFromStdout(data)
      } else if (data instanceof ArrayBuffer) {
        readFromStdout(new Uint8Array(data))
      } else {
        throw new Error('Expected stdout data to be a Uint8Array')
      }
    }

    if (error) firstMessageReject(toError(error))
    else firstMessageResolve()
  }

  workerInstance.postMessage(
    wasmModule || new URL(wasmURL || 'esbuild.wasm', import.meta.url).toString(),
  )

  const { readFromStdout, service } = common.createChannel({
    writeToStdin(bytes) {
      workerInstance.postMessage(bytes)
    },
    isSync: false,
    hasFS: false,
    esbuild: ourselves,
  })

  // This will throw if WebAssembly module instantiation fails
  await firstMessagePromise

  stopService = () => {
    workerInstance.terminate()
    initializePromise = undefined
    stopService = undefined
    hasInitialized = false
  }

  return common.createService(service, {
    isTTY: false,
    defaultWD: '/',
  })
}

/** Coerces an unknown thrown value into a real `Error`. */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/** Returns the running WASM service, starting it on first call. Resets
 * the cached promise on failure so the next call can retry. */
const ensureServiceIsRunning = (): Promise<common.Service> => {
  if (!initializePromise) {
    initializePromise = startRunningService(currentWasmOptions).catch((err) => {
      initializePromise = undefined
      throw err
    })
  }
  return initializePromise
}

/** Public API surface of the WASM transport. */
const api: EsbuildApi = createEsbuildApi({
  ensureService: ensureServiceIsRunning,
  syncStubs: common.createSyncStubs(),
  runtime: 'wasm',
  stop: () => {
    if (stopService) stopService()
    return Promise.resolve()
  },
  onValidate: (options) => {
    if (hasInitialized) {
      throw new Error('Cannot call "initialize" more than once')
    }
    hasInitialized = true
    currentWasmOptions = options
  },
})

/**
 * @param options - Configuration options for the build.
 * @returns A promise that resolves with the build result or rejects with a `BuildFailure`.
 * @see ../shared/types/mod.ts:build
 */
export const build = api.build
/**
 * @param options - Configuration options for the build context.
 * @returns A promise that resolves with a `BuildContext` for long-running operations.
 * @see ../shared/types/mod.ts:context
 */
export const context = api.context
/**
 * @param input - The source code (string) or raw bytes to transform.
 * @param options - Optional transform configuration.
 * @returns A promise that resolves with the transform result or rejects with a `TransformFailure`.
 * @see ../shared/types/mod.ts:transform
 */
export const transform = api.transform
/**
 * @param messages - An array of diagnostic messages to format.
 * @param options - Configuration for the formatter, including `kind` ("error" or "warning").
 * @returns A promise that resolves with an array of formatted message strings.
 * @see ../shared/types/mod.ts:formatMessages
 */
export const formatMessages = api.formatMessages
/**
 * @param metafile - The metafile JSON string or object to analyze.
 * @param options - Optional analysis configuration.
 * @returns A promise that resolves with a human-readable analysis string.
 * @see ../shared/types/mod.ts:analyzeMetafile
 */
export const analyzeMetafile = api.analyzeMetafile
/**
 * Synchronous builds are not supported in the WASM API and throw unconditionally.
 * @throws Always throws an error indicating this API is unavailable in Deno.
 * @see ../shared/types/mod.ts:buildSync
 */
export const buildSync = api.buildSync
/**
 * Synchronous transforms are not supported in the WASM API and throw unconditionally.
 * @throws Always throws an error indicating this API is unavailable in Deno.
 * @see ../shared/types/mod.ts:transformSync
 */
export const transformSync = api.transformSync
/**
 * Synchronous message formatting is not supported in the WASM API and throw unconditionally.
 * @throws Always throws an error indicating this API is unavailable in Deno.
 * @see ../shared/types/mod.ts:formatMessagesSync
 */
export const formatMessagesSync = api.formatMessagesSync
/**
 * Synchronous metafile analysis is not supported in the WASM API and throw unconditionally.
 * @throws Always throws an error indicating this API is unavailable in Deno.
 * @see ../shared/types/mod.ts:analyzeMetafileSync
 */
export const analyzeMetafileSync = api.analyzeMetafileSync
/**
 * @returns A promise that resolves when cleanup is complete.
 * @see ../shared/types/mod.ts:stop
 */
export const stop = api.stop
/**
 * Initializes the esbuild WASM service with the provided configuration.
 *
 * @param options - Configuration for the WASM service, including `wasmURL` (required
 *   in browsers), `wasmModule` (optional pre-loaded module), and `worker` (whether
 *   to run in a worker, default true).
 * @returns A promise that resolves when initialization is complete.
 * @see ../shared/types/mod.ts:initialize
 */
export const initialize = api.initialize
