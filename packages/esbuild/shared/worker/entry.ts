/**
 * @module
 * Worker entrypoint for esbuild's WASM API.
 *
 * Importing this module has two side effects:
 * 1. `./go_wasm.ts` is loaded, which installs the Go WASM runtime shim
 *    (`globalThis.fs` and `globalThis.Go`).
 * 2. {@link installDefaultWorkerHandler} runs, wiring the worker message
 *    handler to `globalThis.onmessage`.
 *
 * The pure factory that the handler delegates to lives in
 * {@link ./runtime.ts}; this entrypoint exists only to run the side effects
 * when `wasm.ts` constructs a Worker via `new Worker(... entry.ts ...)`.
 *
 * Loading this file directly is the right choice when you want the Worker
 * side effects. Consumer code that just wants types or the handler factory
 * should import from {@link ./mod.ts} instead.
 *
 * @see ./mod.ts
 * @see ./runtime.ts
 * @see ../wasm.ts
 */
import '../go_wasm.ts'
import { createWorkerMessageHandler, type EsbuildWorkerGlobal } from './runtime.ts'

const workerGlobal = globalThis as unknown as EsbuildWorkerGlobal

function installDefaultWorkerHandler(): void {
  if (typeof workerGlobal.postMessage !== 'function') return

  // Browser main threads have postMessage too. Avoid hijacking window.onmessage
  // when this module is imported for initialize({ worker: false }).
  if ('document' in workerGlobal) return

  workerGlobal.onmessage = createWorkerMessageHandler(
    workerGlobal.postMessage.bind(workerGlobal),
  )
}

installDefaultWorkerHandler()
