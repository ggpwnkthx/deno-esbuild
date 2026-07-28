/**
 * @module
 * Stream-channel implementation of `transform`. Uses a temporary file for
 * inputs larger than 1 MiB to avoid the os pipe write chunk size limit on
 * macOS.
 *
 * @see ./channel.ts
 * @see ./types.ts
 */
import type * as types from '../types/mod.ts'
import * as protocol from '../stdio_protocol/mod.ts'
import {
  flagsForTransformOptions,
  pushLogFlags,
  transformLogLevelDefaultValue,
} from '../flags/mod.ts'
import { failureErrorWithLog, replaceDetailsInMessages } from '../message_sanitize.ts'
import { extractErrorMessageV8 } from '../v8_stack.ts'
import { createObjectStash } from '../plugin_runner/mod.ts'
import type { Refs, StreamIn, StreamService } from './types.ts'

/** Inputs the transform factory closes over. */
interface TransformContext {
  streamIn: StreamIn
  sendRequest: <Req, Res>(
    refs: Refs | null,
    value: Req,
    callback: (error: string | null, response: Res | null) => void,
  ) => void
}

/** Builds the stream-channel `transform` method. */
export function makeTransform(ctx: TransformContext): StreamService['transform'] {
  const { streamIn, sendRequest } = ctx
  return (
    { callName, refs, input, options, isTTY, fs, callback },
  ) => {
    const details = createObjectStash()

    // Ideally the "transform()" API would be faster than calling "build()"
    // since it doesn't need to touch the file system. However, performance
    // measurements with large files on macOS indicate that sending the data
    // over the stdio pipe can be 2x slower than just using a temporary file.
    //
    // This appears to be an OS limitation. Both the JavaScript and Go code
    // are using large buffers but the pipe only writes data in 8kb chunks.
    // An investigation seems to indicate that this number is hard-coded into
    // the OS source code. Presumably files are faster because the OS uses
    // a larger chunk size, or maybe even reads everything in one syscall.
    //
    // The cross-over size where this starts to be faster is around 1mb on
    // my machine. In that case, this code tries to use a temporary file if
    // possible but falls back to sending the data over the stdio pipe if
    // that doesn't work.
    let start = (inputPath: string | null) => {
      try {
        if (typeof input !== 'string' && !(input instanceof Uint8Array)) {
          throw new Error(
            'The input to "transform" must be a string or a Uint8Array',
          )
        }
        const { flags, mangleCache } = flagsForTransformOptions(
          callName,
          options,
          isTTY,
          transformLogLevelDefaultValue,
        )
        const request: protocol.TransformRequest = {
          command: 'transform',
          flags,
          inputFS: inputPath !== null,
          input: inputPath !== null
            ? protocol.encodeUTF8(inputPath)
            : typeof input === 'string'
            ? protocol.encodeUTF8(input)
            : input,
        }
        if (mangleCache) request.mangleCache = mangleCache
        sendRequest<protocol.TransformRequest, protocol.TransformResponse>(
          refs,
          request,
          (error, response) => {
            if (error) return callback(new Error(error), null)
            const errors = replaceDetailsInMessages(response!.errors, details)
            const warnings = replaceDetailsInMessages(
              response!.warnings,
              details,
            )
            let outstanding = 1
            const next = () => {
              if (--outstanding === 0) {
                const result: types.TransformResult = {
                  warnings,
                  code: response!.code,
                  map: response!.map,
                  mangleCache: undefined,
                  legalComments: undefined,
                }
                if ('legalComments' in response!) {
                  result.legalComments = response?.legalComments
                }
                if (response!.mangleCache) {
                  result.mangleCache = response?.mangleCache
                }
                callback(null, result)
              }
            }
            if (errors.length > 0) {
              return callback(
                failureErrorWithLog('Transform failed', errors, warnings),
                null,
              )
            }

            // Read the JavaScript file from the file system
            if (response!.codeFS) {
              outstanding++
              fs.readFile(response!.code, (err, contents) => {
                if (err !== null) {
                  callback(err, null)
                } else {
                  response!.code = contents!
                  next()
                }
              })
            }

            // Read the source map file from the file system
            if (response!.mapFS) {
              outstanding++
              fs.readFile(response!.map, (err, contents) => {
                if (err !== null) {
                  callback(err, null)
                } else {
                  response!.map = contents!
                  next()
                }
              })
            }

            next()
          },
        )
      } catch (e) {
        const flags: string[] = []
        try {
          pushLogFlags(flags, options, {}, isTTY, transformLogLevelDefaultValue)
        } catch {
          // This is expected to potentially fail if the options are invalid
        }
        const error = extractErrorMessageV8(e, streamIn, details, void 0, '')
        sendRequest(refs, { command: 'error', flags, error }, () => {
          error.detail = details.load(error.detail)
          callback(failureErrorWithLog('Transform failed', [error], []), null)
        })
      }
    }
    // Check if the input is large enough to warrant using a file
    if (
      (typeof input === 'string' || input instanceof Uint8Array) &&
      input.length > 1024 * 1024
    ) {
      const next = start
      start = () => fs.writeFile(input, next)
    }
    start(null)
  }
}
