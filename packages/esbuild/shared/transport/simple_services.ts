/**
 * @module
 * Stream-channel implementations of `formatMessages` and `analyzeMetafile`.
 *
 * These two handlers are simpler than {@link ./build_context.ts} and
 * {@link ./transform.ts} — they only validate options locally and forward a
 * request to the Go service — so they live together in one file.
 *
 * @see ./channel.ts
 * @see ./types.ts
 */
import * as protocol from '../stdio_protocol/mod.ts'
import {
  checkForInvalidFlags,
  getFlag,
  mustBeBoolean,
  mustBeInteger,
  mustBeString,
  type OptionKeys,
} from '../validation.ts'
import { sanitizeMessages } from '../message_sanitize.ts'
import type { Refs, StreamService } from './types.ts'

/** Inputs the simple-service factories close over. */
interface SimpleServiceContext {
  sendRequest: <Req, Res>(
    refs: Refs | null,
    value: Req,
    callback: (error: string | null, response: Res | null) => void,
  ) => void
}

/** Stream-channel implementation of `formatMessages`. Validates the
 * options locally and forwards them to the Go service. */
export function makeFormatMessages(
  ctx: SimpleServiceContext,
): StreamService['formatMessages'] {
  const { sendRequest } = ctx
  return ({ callName, refs, messages, options, callback }) => {
    if (!options) {
      throw new Error(`Missing second argument in ${callName}() call`)
    }
    const keys: OptionKeys = {}
    const kind = getFlag(options, keys, 'kind', mustBeString)
    const color = getFlag(options, keys, 'color', mustBeBoolean)
    const terminalWidth = getFlag(
      options,
      keys,
      'terminalWidth',
      mustBeInteger,
    )
    checkForInvalidFlags(options, keys, `in ${callName}() call`)
    if (kind === void 0) {
      throw new Error(`Missing "kind" in ${callName}() call`)
    }
    if (kind !== 'error' && kind !== 'warning') {
      throw new Error(
        `Expected "kind" to be "error" or "warning" in ${callName}() call`,
      )
    }
    const request: protocol.FormatMsgsRequest = {
      command: 'format-msgs',
      messages: sanitizeMessages(messages, 'messages', null, '', terminalWidth),
      isWarning: kind === 'warning',
    }
    if (color !== void 0) request.color = color
    if (terminalWidth !== void 0) request.terminalWidth = terminalWidth
    sendRequest<protocol.FormatMsgsRequest, protocol.FormatMsgsResponse>(
      refs,
      request,
      (error, response) => {
        if (error) return callback(new Error(error), null)
        callback(null, response!.messages)
      },
    )
  }
}

/** Stream-channel implementation of `analyzeMetafile`. */
export function makeAnalyzeMetafile(
  ctx: SimpleServiceContext,
): StreamService['analyzeMetafile'] {
  const { sendRequest } = ctx
  return ({ callName, refs, metafile, options, callback }) => {
    if (options === void 0) options = {}
    const keys: OptionKeys = {}
    const color = getFlag(options, keys, 'color', mustBeBoolean)
    const verbose = getFlag(options, keys, 'verbose', mustBeBoolean)
    checkForInvalidFlags(options, keys, `in ${callName}() call`)
    const request: protocol.AnalyzeMetafileRequest = {
      command: 'analyze-metafile',
      metafile,
    }
    if (color !== void 0) request.color = color
    if (verbose !== void 0) request.verbose = verbose
    sendRequest<
      protocol.AnalyzeMetafileRequest,
      protocol.AnalyzeMetafileResponse
    >(
      refs,
      request,
      (error, response) => {
        if (error) return callback(new Error(error), null)
        callback(null, response!.result)
      },
    )
  }
}
