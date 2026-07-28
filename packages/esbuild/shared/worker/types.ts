/**
 * @module
 * Public type declarations for the esbuild WASM worker runtime.
 *
 * These declarations are split out from {@link ./runtime.ts} so consumers
 * that only need the type surface (e.g. `wasm.ts`, plugin tooling) can
 * import them without pulling in the message-handler factory.
 *
 * @see ./runtime.ts
 * @see ../worker/entry.ts
 */

/**
 * Messages accepted by the esbuild WASM worker.
 *
 * The first message must contain either a `WebAssembly.Module` or a URL
 * string for `esbuild.wasm`; subsequent messages are stdin packets.
 */
export type WorkerInputMessage =
  | Uint8Array
  | ArrayBuffer
  | WebAssembly.Module
  | string

/** Messages the worker posts back to the host. Either a stdout chunk,
 * `null` when the worker is ready, or an `Error` if it failed to start. */
export type WorkerOutputMessage = Uint8Array | Error | null

/** Errno-style callback used by the Go WASM filesystem shim. */
export type ErrnoCallback = (err: Error | null, count?: number) => void

/** Subset of the Go WASM filesystem shim used by the worker. */
export interface GoWasmFS {
  /** Write `buffer` to file descriptor `fd`. Returns the number of bytes
   * written. */
  writeSync(fd: number, buffer: Uint8Array): number
  /** Read up to `length` bytes from file descriptor `fd` into `buffer` at
   * `offset`, then invoke `callback` with the byte count (or an error). */
  read(
    fd: number,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number | null,
    callback: ErrnoCallback,
  ): void
}

/**
 * Subset of the Go WASM runtime handle exposed to esbuild's worker plumbing.
 */
export interface GoWasmRuntimeHandle {
  /** Command-line arguments passed to the Go runtime. */
  argv: string[]
  /** WebAssembly imports the runtime needs to instantiate. */
  importObject: WebAssembly.Imports
  /** Boot the runtime against the given WebAssembly instance. */
  run(instance: WebAssembly.Instance): Promise<void> | void

  /** Pending `setTimeout` ids, used by `wasm.ts` to clean up the
   * main-thread runtime when `worker: false` is requested. */
  // This exists on the Go runtime shim and is used by wasm.ts to clean up the
  // main-thread runtime when worker: false is used.
  _scheduledTimeouts: Map<number, ReturnType<typeof setTimeout>>
}

/** Constructor signature for the Go WASM runtime. */
export interface GoWasmRuntimeConstructor {
  /** Construct a fresh Go WASM runtime handle. */
  new (): GoWasmRuntimeHandle
}

/** Subset of the `globalThis` shape the worker reads at startup. */
export interface EsbuildWorkerGlobal {
  /** Filesystem shim installed by `go_wasm.ts`. */
  fs?: GoWasmFS
  /** Go runtime constructor installed by `go_wasm.ts`. */
  Go?: GoWasmRuntimeConstructor
  /** Outbound message channel. */
  postMessage?: (message: WorkerOutputMessage) => void
  /** Inbound message channel. */
  onmessage?: ((message: { data: WorkerInputMessage }) => void) | null
  /** Presence of `document` distinguishes browser main thread from workers. */
  document?: unknown
}
