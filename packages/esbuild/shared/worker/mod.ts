/**
 * @module
 * Pure barrel for the WASM Web worker runtime.
 *
 * Re-exports the public types and the message-handler factory used by both
 * the Worker entrypoint ({@link ./entry.ts}) and the main-thread fallback in
 * `wasm.ts`.
 *
 * This module is side-effect-free; the Worker entrypoint that imports the
 * Go WASM shim and installs the default handler lives in
 * {@link ./entry.ts}. Loading this file directly is the right choice for
 * consumer code that wants only the type surface or the factory.
 *
 * @see ./runtime.ts
 * @see ./entry.ts
 * @see ../wasm.ts
 */
export type {
  GoWasmFS,
  GoWasmRuntimeConstructor,
  GoWasmRuntimeHandle,
  WorkerInputMessage,
} from './types.ts'
export { createWorkerMessageHandler } from './runtime.ts'
