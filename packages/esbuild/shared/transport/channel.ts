/**
 * @module
 * Stdio packet channel used to communicate with the esbuild service
 * process/worker.
 *
 * The returned `readFromStdout` accumulates wire packets out of a stream of
 * bytes, eventually reaching the registered `requestCallbacks` for inbound
 * requests and resolving the `responseCallbacks` for outbound responses.
 *
 * Packet growth is bounded by {@link MAX_PACKET_BYTES}; a peer that declares
 * a packet larger than this cap will fail with a descriptive error instead
 * of OOMing the host.
 *
 * This module cannot use promises in the main execution flow because it must
 * work for both sync and async code. There is an exception for plugin code
 * because that can't work in sync code anyway.
 *
 * @see ./types.ts
 * @see ./build_context.ts
 * @see ./version.ts
 */
import * as protocol from '../stdio_protocol/mod.ts'
import { extractErrorMessageV8 } from '../v8_stack.ts'
import type { RequestCallback } from '../plugin_runner/mod.ts'
import { ESBUILD_VERSION } from './version.ts'
import type { Refs, StreamIn, StreamOut, StreamService } from './types.ts'
import { buildOrContextImpl } from './build_context.ts'
import { makeTransform } from './transform.ts'
import { makeAnalyzeMetafile, makeFormatMessages } from './simple_services.ts'

/** Bookkeeping for the channel shutdown sequence. */
type CloseData = { didClose: boolean; reason: string }

/** Maximum size of a single wire packet, in bytes. Larger packets are
 * rejected so a misbehaving peer cannot cause the host to allocate
 * unbounded memory. */
const MAX_PACKET_BYTES = 64 * 1024 * 1024

/**
 * Creates a stdio channel pair for communicating with an esbuild service
 * process/worker.
 */
export function createChannel(streamIn: StreamIn): StreamOut {
  const requestCallbacksByKey: {
    [key: number]: { [command: string]: RequestCallback }
  } = {}
  const closeData: CloseData = { didClose: false, reason: '' }
  let responseCallbacks: {
    [id: number]: (error: string | null, response: protocol.Value) => void
  } = {}
  let nextRequestID = 0
  let nextBuildKey = 0

  // Use a long-lived buffer to store stdout data
  let stdout = new Uint8Array(16 * 1024)
  let stdoutUsed = 0
  const readFromStdout = (chunk: Uint8Array) => {
    // Append the chunk to the stdout buffer, growing it as necessary
    const limit = stdoutUsed + chunk.length
    if (limit > MAX_PACKET_BYTES) {
      throw new Error(
        `Incoming esbuild protocol packet exceeds ${MAX_PACKET_BYTES} bytes (got ${limit}); ` +
          `refusing to allocate`,
      )
    }
    if (limit > stdout.length) {
      const swap = new Uint8Array(Math.min(MAX_PACKET_BYTES, limit * 2))
      swap.set(stdout)
      stdout = swap
    }
    stdout.set(chunk, stdoutUsed)
    stdoutUsed += chunk.length

    // Process all complete (i.e. not partial) packets
    let offset = 0
    while (offset + 4 <= stdoutUsed) {
      const length = protocol.readUInt32LE(stdout, offset)
      if (offset + 4 + length > stdoutUsed) {
        break
      }
      offset += 4
      handleIncomingPacket(stdout.subarray(offset, offset + length))
      offset += length
    }
    if (offset > 0) {
      stdout.copyWithin(0, offset, stdoutUsed)
      stdoutUsed -= offset
    }
  }

  const afterClose = (error: Error | null) => {
    // When the process is closed, fail all pending requests
    closeData.didClose = true
    if (error) closeData.reason = ': ' + (error.message || error)
    const text = 'The service was stopped' + closeData.reason
    for (const id in responseCallbacks) {
      responseCallbacks[id]!(text, null)
    }
    responseCallbacks = {}
  }

  const sendRequest = <Req, Res>(
    refs: Refs | null,
    value: Req,
    callback: (error: string | null, response: Res | null) => void,
  ): void => {
    if (closeData.didClose) {
      return callback(
        'The service is no longer running' + closeData.reason,
        null,
      )
    }
    const id = nextRequestID++
    responseCallbacks[id] = (error, response) => {
      try {
        // deno-lint-ignore no-explicit-any
        callback(error, response as any)
      } finally {
        if (refs) refs.unref() // Do this after the callback so the callback can extend the lifetime if needed
      }
    }
    if (refs) refs.ref()
    streamIn.writeToStdin(
      // deno-lint-ignore no-explicit-any
      protocol.encodePacket({ id, isRequest: true, value: value as any }),
    )
  }

  const sendResponse = (id: number, value: protocol.Value): void => {
    if (closeData.didClose) {
      throw new Error('The service is no longer running' + closeData.reason)
    }
    streamIn.writeToStdin(
      protocol.encodePacket({ id, isRequest: false, value }),
    )
  }

  const handleRequest = async (id: number, request: protocol.BuildRequest) => {
    // Catch exceptions in the code below so they get passed to the caller
    try {
      if ((request.command as string) === 'ping') {
        sendResponse(id, {})
        return
      }

      if (typeof request.key === 'number') {
        const requestCallbacks = requestCallbacksByKey[request.key]
        if (!requestCallbacks) {
          // Ignore invalid commands for old builds that no longer exist.
          // This can happen when "context.cancel" and "context.dispose"
          // is called while esbuild is processing many files in parallel.
          // See https://github.com/evanw/esbuild/issues/3318 for details.
          return
        }
        const callback = requestCallbacks[request.command]
        if (callback) {
          await callback(id, request)
          return
        }
      }

      throw new Error(`Invalid command: ` + request.command)
    } catch (e) {
      const errors = [extractErrorMessageV8(e, streamIn, null, void 0, '')]
      try {
        // deno-lint-ignore no-explicit-any
        sendResponse(id, { errors } as any)
      } catch {
        // This may fail if the esbuild process is no longer running, but
        // that's ok. Catch and swallow this exception so that we don't
        // cause an unhandled promise rejection. Our caller isn't expecting
        // this call to fail and doesn't handle the promise rejection.
      }
    }
  }

  let isFirstPacket = true

  const handleIncomingPacket = (bytes: Uint8Array): void => {
    // The first packet is a version check. The Go service sends a plain
    // ASCII version string immediately after connecting; we compare it to
    // ESBUILD_VERSION to catch installation/transcript mismatches before
    // attempting any RPC.
    if (isFirstPacket) {
      isFirstPacket = false

      const binaryVersion = String.fromCharCode(...bytes)
      if (binaryVersion !== ESBUILD_VERSION) {
        throw new Error(
          `Cannot start service: Host version "${ESBUILD_VERSION}" does not match binary version ${
            JSON.stringify(binaryVersion)
          }`,
        )
      }
      return
    }

    const packet = protocol.decodePacket(bytes)

    if (packet.isRequest) {
      handleRequest(
        packet.id,
        packet.value as unknown as protocol.BuildRequest,
      )
    } else {
      const callback = responseCallbacks[packet.id]!
      delete responseCallbacks[packet.id]
      if (packet.value && (packet.value as { error?: string }).error) {
        callback((packet.value as { error: string }).error, {})
      } else callback(null, packet.value)
    }
  }

  /** Stream-channel implementation of `build` and `context`; both
   * delegate to {@link buildOrContextImpl} with the matching `callName`. */
  const buildOrContext: StreamService['buildOrContext'] = (
    { callName, refs, options, isTTY, defaultWD, callback },
  ) => {
    let refCount = 0
    const buildKey = nextBuildKey++
    const requestCallbacks: { [command: string]: RequestCallback } = {}
    const buildRefs: Refs = {
      ref() {
        if (++refCount === 1) {
          if (refs) refs.ref()
        }
      },
      unref() {
        if (--refCount === 0) {
          delete requestCallbacksByKey[buildKey]
          if (refs) refs.unref()
        }
      },
    }
    requestCallbacksByKey[buildKey] = requestCallbacks

    // Guard the whole "build" request with a temporary ref count bump. We
    // don't want the ref count to be bumped above zero and then back down
    // to zero before the callback is called.
    buildRefs.ref()
    buildOrContextImpl(
      callName,
      buildKey,
      sendRequest,
      sendResponse,
      buildRefs,
      streamIn,
      requestCallbacks,
      options,
      isTTY,
      defaultWD,
      (err, res) => {
        // Now that the initial "build" request is done, we can release our
        // temporary ref count bump. Any code that wants to extend the life
        // of the build will have to do so by explicitly retaining a count.
        try {
          callback(err, res)
        } finally {
          buildRefs.unref()
        }
      },
    )
  }

  /** Stream-channel implementation of `transform`. Uses a temporary file
   * for inputs larger than 1 MiB to avoid the os pipe write chunk size
   * limit on macOS. The body lives in {@link ./transform.ts:makeTransform}
   * so the channel stays focused on packet routing. */
  const transform = makeTransform({ streamIn, sendRequest })

  const formatMessages = makeFormatMessages({ sendRequest })
  const analyzeMetafile = makeAnalyzeMetafile({ sendRequest })

  return {
    readFromStdout,
    afterClose,
    service: {
      buildOrContext,
      transform,
      formatMessages,
      analyzeMetafile,
    },
  }
}
