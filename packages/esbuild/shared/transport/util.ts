/**
 * @module
 * Output-file conversion and JSON parsing helpers used by the transport.
 *
 * @see ./channel.ts
 * @see ./build_context.ts
 */
import type * as types from '../types/mod.ts'
import * as protocol from '../stdio_protocol/mod.ts'
import { JSON_parse } from '../uint8array_json_parser.ts'

/**
 * Converts a wire-format `BuildOutputFile` into the public `OutputFile`
 * shape. The `text` property is generated lazily on first access.
 */
export function convertOutputFiles(
  { path, contents, hash }: protocol.BuildOutputFile,
): types.OutputFile {
  // The text is lazily-generated for performance reasons. If no one asks
  // for it, then it never needs to be generated.
  let text: string | null = null
  return {
    path,
    contents,
    hash,
    get text() {
      // People want to be able to set "contents" and have esbuild
      // automatically derive "text" for them, so grab the contents off of
      // this object instead of using our original value.
      const binary = this.contents

      // This deliberately doesn't do bidirectional derivation because that
      // could result in the inefficiency. For example, if we did do this and
      // then you set "contents" and "text" and then asked for "contents", the
      // second setter for "text" will have erased our cached "contents"
      // value so we'd need to regenerate it again. Instead, "contents" is
      // unambiguously the primary value and "text" is unambiguously the
      // derived value.
      if (text === null || binary !== contents) {
        contents = binary
        text = protocol.decodeUTF8(binary)
      }
      return text
    },
  }
}

/**
 * Parses JSON from a `Uint8Array` without first allocating a string. Falls
 * back to the byte-level parser in `../uint8array_json_parser.ts` when V8's
 * string-length cap blocks a direct `decodeUTF8 + JSON.parse`.
 */
export function parseJSON(bytes: Uint8Array): unknown {
  let text: string
  try {
    // This may fail in V8 with the error "Cannot create a string longer
    // than 0x1fffffe8 characters". Other JS engines may have similar
    // limitations.
    text = protocol.decodeUTF8(bytes)
  } catch {
    // In that case, we attempt to parse the JSON ourselves directly from
    // the Uint8Array. This bypasses the string length limit as we no longer
    // need to construct a string that's the length of the input. However,
    // doing this is likely significantly slower (perhaps around ~4x
    // slower?), so we only do it if we have to.
    return JSON_parse(bytes)
  }
  return JSON.parse(text)
}
