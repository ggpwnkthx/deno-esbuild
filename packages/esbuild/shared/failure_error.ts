/**
 * @module
 * Build/wrap helpers for `BuildFailure`-shaped errors.
 *
 * `failureErrorWithLog` shapes the `Error` that {@link ./message_sanitize.ts}
 * returns to user code when a build or transform fails. The `errors` and
 * `warnings` fields are exposed as lazy getters so the embedded arrays do
 * not leak into the default uncaught-exception log.
 *
 * @see ./message_sanitize.ts
 * @see ../types.ts:BuildFailure
 */
import type * as types from './types/mod.ts'

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
