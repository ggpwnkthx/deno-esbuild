/**
 * @module
 * Pure factory for the esbuild WASM worker message handler.
 *
 * The types referenced by this module live in {@link ./types.ts}. The factory
 * itself is shared by the Worker entrypoint ({@link ../worker/entry.ts}) and
 * the main-thread fallback in `wasm.ts`.
 *
 * @see ../wasm.ts
 * @see ./types.ts
 */
import { ESBUILD_VERSION } from '../transport/mod.ts'
import type {
  EsbuildWorkerGlobal,
  GoWasmFS,
  GoWasmRuntimeConstructor,
  GoWasmRuntimeHandle,
  WorkerInputMessage,
  WorkerOutputMessage,
} from './types.ts'

// Re-exported so `./entry.ts` can keep importing the worker global shape
// from this module rather than reaching into `./types.ts`.
export type { EsbuildWorkerGlobal } from './types.ts'

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

/** Instantiates a `WebAssembly.Module` either from a pre-loaded `Module`
 * instance or by fetching the supplied URL. Uses
 * `WebAssembly.instantiateStreaming` when the response advertises
 * `application/wasm`. */
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

/** Coerces an unknown thrown value into a real `Error`. */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
