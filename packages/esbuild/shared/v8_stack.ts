/**
 * @module
 * V8-style stack trace parsing and error-message extraction helpers.
 *
 * The esbuild service is implemented in Go and runs the user's plugins on the
 * JavaScript side. When a plugin callback throws, the runtime extracts a
 * `Message` with an optional `Location` so that the formatted error shows the
 * callable source instead of the generic "Internal error". These helpers are
 * pure: they consume the {@link StreamIn} `readFileSync` only to lazily read
 * the source file referenced in the stack frame.
 */
import type * as types from './types.ts'
import * as protocol from './stdio_protocol.ts'

/**
 * The input end of the stdio channel. Only the optional `readFileSync`
 * property is used here; the rest is for the transport layer.
 */
export interface StreamInLike {
  readFileSync?: (path: string, encoding: 'utf8') => string
}

/**
 * Structural subset of the object-stash API used by `extractErrorMessageV8`.
 * The full {@link ObjectStash} lives in `plugin_runner.ts`; both producers
 * and consumers depend only on this shape so the type can be referenced from
 * either direction without a circular import.
 */
export interface ObjectStashLike {
  store(value: unknown): number
}

/**
 * Builds a thunk that, when called, returns the `Note` describing where a
 * plugin callback was registered. The note is computed lazily and at most
 * once because stack parsing is expensive.
 */
export function extractCallerV8(
  e: Error,
  streamIn: StreamInLike,
  ident: string,
): () => types.Note | undefined {
  let note: types.Note | undefined
  let tried = false
  return () => {
    if (tried) return note
    tried = true
    try {
      const lines = (e.stack + '').split('\n')
      lines.splice(1, 1)
      const location = parseStackLinesV8(streamIn, lines, ident)
      if (location) {
        note = { text: e.message, location }
        return note
      }
    } catch {
      // Ignore errors when parsing stack traces
    }
  }
}

/**
 * Converts an unknown thrown value into a `types.Message`. The message
 * intentionally reports `Internal error` if the value is not even a stringifiable
 * object, and tries to attach a `Location` from the parsed stack trace.
 *
 * The `stash` parameter is required so that the caller can deduplicate the
 * `detail` field across multiple error messages. `null` disables deduplication.
 */
export function extractErrorMessageV8(
  e: unknown,
  streamIn: StreamInLike,
  stash: ObjectStashLike | null,
  note: types.Note | undefined,
  pluginName: string,
): types.Message {
  let text = 'Internal error'
  let location: types.Location | null = null

  try {
    text = ((e && (e as Error).message) || e) + ''
  } catch {
    // Ignore errors when extracting error message
  }

  // Optionally attempt to extract the file from the stack trace, works in V8/node
  try {
    location = parseStackLinesV8(
      streamIn,
      ((e as Error).stack + '').split('\n'),
      '',
    )
  } catch {
    // Ignore errors when parsing stack traces
  }

  return {
    id: '',
    pluginName,
    text,
    location,
    notes: note ? [note] : [],
    detail: stash ? stash.store(e) : -1,
  }
}

export function parseStackLinesV8(
  streamIn: StreamInLike,
  lines: string[],
  ident: string,
): types.Location | null {
  const at = '    at '

  // Check to see if this looks like a V8 stack trace
  if (
    streamIn.readFileSync && !lines[0]!.startsWith(at) && lines[1]!.startsWith(at)
  ) {
    for (let i = 1; i < lines.length; i++) {
      let line = lines[i]!
      if (!line.startsWith(at)) continue
      line = line.slice(at.length)
      while (true) {
        // Unwrap a function name
        let match = /^(?:new |async )?\S+ \((.*)\)$/.exec(line)
        if (match) {
          line = match[1]!
          continue
        }

        // Unwrap an eval wrapper
        match = /^eval at \S+ \((.*)\)(?:, \S+:\d+:\d+)?$/.exec(line)
        if (match) {
          line = match[1]!
          continue
        }

        // Match on the file location
        match = /^(\S+):(\d+):(\d+)$/.exec(line)
        if (match) {
          let contents
          try {
            contents = streamIn.readFileSync(match[1]!, 'utf8')
          } catch {
            // Ignore errors when reading file
            break
          }
          const lineText = contents.split(/\r\n|\r|\n|\u2028|\u2029/)[+match[2]! - 1] ||
            ''
          const column = +match[3]! - 1
          const length = lineText.slice(column, column + ident.length) === ident ? ident.length : 0
          return {
            file: match[1]!,
            namespace: 'file',
            line: +match[2]!,
            column: protocol.encodeUTF8(lineText.slice(0, column)).length,
            length: protocol.encodeUTF8(lineText.slice(column, column + length))
              .length,
            lineText: lineText + '\n' + lines.slice(1).join('\n'),
            suggestion: '',
          }
        }
        break
      }
    }
  }

  return null
}
