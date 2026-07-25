/**
 * @module
 * Sanitization helpers for esbuild diagnostic messages and notes.
 *
 * Plugin and built-in error messages flow in from the Go service as
 * `PartialMessage` objects and need to be normalized before they can be
 * surfaced to user code or wrapped in a `BuildFailure`. The functions in
 * this file handle:
 * - Coercing `PartialMessage` to `Message` (filling in defaults, validating
 *   the shape, deduplicating `detail` via the object stash).
 * - Trimming `lineText` for the performance-sensitive "huge minified file"
 *   case (see esbuild#3467).
 * - Reconstructing failures with the standard "Build failed with N errors"
 *   summary text.
 */
import type * as types from './types.ts'
import {
  canBeAnything,
  checkForInvalidFlags,
  getFlag,
  mustBeArray,
  mustBeInteger,
  mustBeObject,
  mustBeObjectOrNull,
  mustBeString,
  mustBeStringOrArrayOfStrings,
  mustBeStringOrBoolean,
  type OptionKeys,
} from './validation.ts'

/**
 * Structural subset of the object-stash API used by `sanitizeMessages`. The
 * full implementation lives in `plugin_runner.ts`; both sides depend only on
 * this shape to avoid a circular import.
 */
export interface ObjectStashLike {
  /** Store `value` and return the lookup id used by `load`. */
  store(value: unknown): number
  /** Look up a value previously stored under `id`. */
  load(id: number): unknown
}

/**
 * Normalizes a `PartialMessage['location']` into a fully populated
 * {@link types.Message} location. Fills missing fields with defaults and
 * trims the trailing `lineText` for the performance-sensitive case of
 * huge minified files (see esbuild#3467).
 */
export function sanitizeLocation(
  location: types.PartialMessage['location'],
  where: string,
  terminalWidth: number | undefined,
): types.Message['location'] {
  if (location == null) return null

  const keys: OptionKeys = {}
  const file = getFlag(location, keys, 'file', mustBeString)
  const namespace = getFlag(location, keys, 'namespace', mustBeString)
  const line = getFlag(location, keys, 'line', mustBeInteger)
  const column = getFlag(location, keys, 'column', mustBeInteger)
  const length = getFlag(location, keys, 'length', mustBeInteger)
  let lineText = getFlag(location, keys, 'lineText', mustBeString)
  const suggestion = getFlag(location, keys, 'suggestion', mustBeString)
  checkForInvalidFlags(location, keys, where)

  // Performance hack: Some people pass enormous minified files as the line
  // text with a column near the beginning of the line and then complain
  // when this function is slow. The slowness comes from serializing a huge
  // string. But the vast majority of that string is unnecessary. Try to
  // detect when this is the case and trim the string before serialization
  // to avoid the performance hit. See: https://github.com/evanw/esbuild/issues/3467
  if (lineText) {
    // Try to conservatively guess the maximum amount of relevant text
    const relevantASCII = lineText.slice(
      0,
      (column && column > 0 ? column : 0) +
        (length && length > 0 ? length : 0) +
        (terminalWidth && terminalWidth > 0 ? terminalWidth : 80),
    )

    // Make sure it's ASCII (so the byte-oriented column and length values
    // are correct) and that there are no newlines (so that our logging code
    // doesn't look at the end of the string)
    if (!/[\x7F-\uFFFF]/.test(relevantASCII) && !/\n/.test(lineText)) {
      lineText = relevantASCII
    }
  }

  // Note: We could technically make this even faster by maintaining two copies
  // of this code, one in Go and one in TypeScript. But I'm not going to do that.
  // The point of this function is to call into the real Go code to get what it
  // does. If someone wants a JS version, they can port it themselves.

  return {
    file: file || '',
    namespace: namespace || '',
    line: line || 0,
    column: column || 0,
    length: length || 0,
    lineText: lineText || '',
    suggestion: suggestion || '',
  }
}

/**
 * Sanitizes a list of `PartialMessage` objects into `Message` objects, filling
 * defaults, validating the shape, and deduplicating `detail` references via
 * the supplied object stash when one is provided.
 */
export function sanitizeMessages(
  messages: types.PartialMessage[],
  property: string,
  stash: ObjectStashLike | null,
  fallbackPluginName: string,
  terminalWidth: number | undefined,
): types.Message[] {
  const messagesClone: types.Message[] = []
  let index = 0

  for (const message of messages) {
    const keys: OptionKeys = {}
    const id = getFlag(message, keys, 'id', mustBeString)
    const pluginName = getFlag(message, keys, 'pluginName', mustBeString)
    const text = getFlag(message, keys, 'text', mustBeString)
    const location = getFlag(message, keys, 'location', mustBeObjectOrNull)
    const notes = getFlag(message, keys, 'notes', mustBeArray)
    const detail = getFlag(message, keys, 'detail', canBeAnything)
    const where = `in element ${index} of "${property}"`
    checkForInvalidFlags(message, keys, where)

    const notesClone: types.Note[] = []
    if (notes) {
      for (const note of notes) {
        const noteKeys: OptionKeys = {}
        const noteText = getFlag(note, noteKeys, 'text', mustBeString)
        const noteLocation = getFlag(
          note,
          noteKeys,
          'location',
          mustBeObjectOrNull,
        )
        checkForInvalidFlags(note, noteKeys, where)
        notesClone.push({
          text: noteText || '',
          location: sanitizeLocation(noteLocation, where, terminalWidth),
        })
      }
    }

    messagesClone.push({
      id: id || '',
      pluginName: pluginName || fallbackPluginName,
      text: text || '',
      location: sanitizeLocation(location, where, terminalWidth),
      notes: notesClone,
      detail: stash ? stash.store(detail) : -1,
    })
    index++
  }

  return messagesClone
}

/**
 * Validates that every entry of `values` is a string and returns a typed
 * array. Used by the plugin pipeline for hand-written arrays of plugin
 * metadata (e.g. `watchFiles`, `watchDirs`).
 */
export function sanitizeStringArray(values: unknown[], property: string): string[] {
  const result: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') {
      throw new Error(`${JSON.stringify(property)} must be an array of strings`)
    }
    result.push(value)
  }
  return result
}

/**
 * Validates that every entry of `map` has a string value and returns a
 * typed `Record<string, string>`. Returns a null-prototype object so the
 * shape is predictable downstream.
 */
export function sanitizeStringMap(
  map: Record<string, unknown>,
  property: string,
): Record<string, string> {
  const result: Record<string, string> = Object.create(null)
  for (const key in map) {
    const value = map[key]
    if (typeof value !== 'string') {
      throw new Error(
        `key ${JSON.stringify(key)} in object ${JSON.stringify(property)} must be a string`,
      )
    }
    result[key] = value
  }
  return result
}

/**
 * Replaces the `detail` field on each message with the live object looked up
 * from the stash. Idempotent in the sense that the input messages are
 * mutated and returned.
 */
export function replaceDetailsInMessages(
  messages: types.Message[],
  stash: ObjectStashLike,
): types.Message[] {
  for (const message of messages) {
    message.detail = stash.load(message.detail)
  }
  return messages
}

/**
 * Wraps an array of `Message` instances in a `BuildFailure` whose `message`
 * property mirrors the upstream esbuild error format. The `errors` and
 * `warnings` fields are exposed as lazy getters so that the embedded arrays
 * do not leak into the default uncaught-exception log.
 */
export function failureErrorWithLog(
  text: string,
  errors: types.Message[],
  warnings: types.Message[],
): types.BuildFailure {
  const limit = 5
  text += errors.length < 1 ? '' : ` with ${errors.length} error${errors.length < 2 ? '' : 's'}:` +
    errors.slice(0, limit + 1).map((e, i) => {
      if (i === limit) return '\n...'
      if (!e.location) return `\nerror: ${e.text}`
      const { file, line, column } = e.location
      const pluginText = e.pluginName ? `[plugin: ${e.pluginName}] ` : ''
      return `\n${file}:${line}:${column}: ERROR: ${pluginText}${e.text}`
    }).join('')
  const error: Error & {
    errors?: types.Message[]
    warnings?: types.Message[]
  } = new Error(text)

  // Use a getter instead of a plain property so that when the error is thrown
  // without being caught and the node process exits, the error objects aren't
  // printed. The error objects are pretty big and not helpful because a) esbuild
  // already prints errors to stderr by default and b) the error summary already
  // has a more helpful abbreviated form of the error messages.
  for (
    const [key, value] of [['errors', errors], ['warnings', warnings]] as const
  ) {
    Object.defineProperty(error, key, {
      configurable: true,
      enumerable: true,
      get: () => value,
      set: (v) =>
        Object.defineProperty(error, key, {
          configurable: true,
          enumerable: true,
          value: v,
        }),
    })
  }

  return error as types.BuildFailure
}

export {
  canBeAnything,
  mustBeArray,
  mustBeInteger,
  mustBeObject,
  mustBeObjectOrNull,
  mustBeString,
  mustBeStringOrArrayOfStrings,
  mustBeStringOrBoolean,
}
