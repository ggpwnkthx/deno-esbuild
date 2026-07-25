/**
 * @module
 * Web worker runtime for esbuild's WASM API.
 *
 * This module imports the Go WASM runtime shim, installs the worker message
 * handler when it is executed inside a Worker, and also exports the same handler
 * factory so wasm.ts can run the service on the current thread when
 * initialize({ worker: false }) is requested.
 *
 * @see ../wasm.ts
 */
import './go_wasm.ts'
import { ESBUILD_VERSION } from './transport.ts'

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
type WorkerOutputMessage = Uint8Array | Error | null

/** Errno-style callback used by the Go WASM filesystem shim. */
type ErrnoCallback = (err: Error | null, count?: number) => void

/** Subset of the Go WASM filesystem shim used by the worker. */
interface GoWasmFS {
  writeSync(fd: number, buffer: Uint8Array): number
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
interface GoWasmRuntimeConstructor {
  new (): GoWasmRuntimeHandle
}

/** Subset of the `globalThis` shape the worker reads at startup. */
interface EsbuildWorkerGlobal {
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

const workerGlobal = globalThis as unknown as EsbuildWorkerGlobal

function requireFS(): GoWasmFS {
  if (!workerGlobal.fs) {
    throw new Error('Go WASM filesystem shim was not installed')
  }
  return workerGlobal.fs
}

function requireGoRuntime(): GoWasmRuntimeConstructor {
  if (!workerGlobal.Go) {
    throw new Error('Go WASM runtime shim was not installed')
  }
  return workerGlobal.Go
}

function asStdinChunk(data: WorkerInputMessage): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  throw new Error('Expected stdin data to be a Uint8Array or ArrayBuffer')
}

/**
 * Creates an esbuild WASM worker message handler.
 *
 * The first message must contain either a `WebAssembly.Module` or a URL string
 * for `esbuild.wasm`. Later messages are stdin packets for the esbuild service.
 */
export function createWorkerMessageHandler(
  postMessage: (message: WorkerOutputMessage) => void,
): (event: { data: WorkerInputMessage }) => GoWasmRuntimeHandle | undefined {
  let go: GoWasmRuntimeHandle | undefined
  let stdin: Uint8Array[] = []
  let stdinPos = 0
  let resumeStdin: (() => void) | undefined

  const decoder = new TextDecoder()
  let stderr = ''

  const fs = requireFS()
  fs.writeSync = (fd, buffer) => {
    if (fd === 1) {
      postMessage(buffer)
    } else if (fd === 2) {
      stderr += decoder.decode(buffer)
      const parts = stderr.split('\n')
      if (parts.length > 1) console.log(parts.slice(0, -1).join('\n'))
      stderr = parts[parts.length - 1] ?? ''
    } else {
      throw new Error('Bad write')
    }

    return buffer.length
  }

  fs.read = (
    fd,
    buffer,
    offset,
    length,
    position,
    callback,
  ) => {
    if (
      fd !== 0 || offset !== 0 || length !== buffer.length || position !== null
    ) {
      throw new Error('Bad read')
    }

    if (stdin.length === 0) {
      resumeStdin = () => fs.read(fd, buffer, offset, length, position, callback)
      return
    }

    const first = stdin[0]!
    const count = Math.max(0, Math.min(length, first.length - stdinPos))
    buffer.set(first.subarray(stdinPos, stdinPos + count), offset)
    stdinPos += count

    if (stdinPos === first.length) {
      stdin = stdin.slice(1)
      stdinPos = 0
    }

    callback(null, count)
  }

  return ({ data }) => {
    if (!go) {
      try {
        if (
          typeof data !== 'string' && !(data instanceof WebAssembly.Module)
        ) {
          throw new Error(
            'Expected first worker message to be a WebAssembly.Module or URL string',
          )
        }

        const Go = requireGoRuntime()
        go = new Go()
        go.argv = ['', `--service=${ESBUILD_VERSION}`]

        tryToInstantiateModule(data, go).then(
          (instance) => {
            postMessage(null)
            const runResult = go!.run(instance)
            if (runResult) {
              runResult.catch((error: unknown) => {
                console.error(error)
              })
            }
          },
          (error: unknown) => {
            postMessage(toError(error))
          },
        )
      } catch (error) {
        postMessage(toError(error))
      }

      return go
    }

    const chunk = asStdinChunk(data)
    if (chunk.length > 0) {
      stdin.push(chunk)
      const resume = resumeStdin
      resumeStdin = undefined
      resume?.()
    }

    return go
  }
}

async function tryToInstantiateModule(
  wasm: WebAssembly.Module | string,
  go: GoWasmRuntimeHandle,
): Promise<WebAssembly.Instance> {
  if (wasm instanceof WebAssembly.Module) {
    return WebAssembly.instantiate(wasm, go.importObject)
  }

  const response = await fetch(wasm)
  if (!response.ok) {
    throw new Error(`Failed to download ${JSON.stringify(wasm)}`)
  }

  if (
    'instantiateStreaming' in WebAssembly &&
    /^application\/wasm($|;)/i.test(response.headers.get('Content-Type') || '')
  ) {
    const result = await WebAssembly.instantiateStreaming(
      response,
      go.importObject,
    )
    return result.instance
  }

  const bytes = await response.arrayBuffer()
  const result = await WebAssembly.instantiate(bytes, go.importObject)
  return result.instance
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

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
