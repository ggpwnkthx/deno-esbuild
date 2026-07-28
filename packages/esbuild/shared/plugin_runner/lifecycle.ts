/**
 * @module
 * Lifecycle builders used by the transport: `runOnEndCallbacks` and
 * `scheduleOnDisposeCallbacks`.
 *
 * @see ./request_callbacks.ts
 * @see ./handle_plugins.ts
 */
import type * as types from '../types/mod.ts'
import type { ObjectStash } from './object_stash.ts'
import type { CallbackRegistries, RequestCallbackContext } from './request_callbacks.ts'
import type { RunOnEndCallbacks } from './types.ts'
import { collectPluginMessages, exceptionToMessage } from './messages.ts'

/**
 * Builds the `runOnEndCallbacks` function the transport invokes after each
 * build to fire the registered `onEnd` hooks. If no plugin registered an
 * `onEnd` hook, the returned function is a no-op that immediately calls
 * `done([], [])`.
 */
export function makeRunOnEndCallbacks(
  registries: CallbackRegistries,
  details: ObjectStash,
  streamIn: RequestCallbackContext['streamIn'],
): RunOnEndCallbacks {
  if (registries.onEnd.length === 0) {
    return (_result, done) => done([], [])
  }
  return (result, done) => {
    ;(async () => {
      const onEndErrors: types.Message[] = []
      const onEndWarnings: types.Message[] = []

      for (const { name, callback, note } of registries.onEnd) {
        let newErrors: types.Message[] | undefined
        let newWarnings: types.Message[] | undefined

        try {
          const value = await callback(result)
          const messages = collectPluginMessages(
            value,
            { details, name, streamIn, note },
            `from onEnd() callback in plugin ${JSON.stringify(name)}`,
          )
          newErrors = messages.errors
          newWarnings = messages.warnings
        } catch (e) {
          newErrors = [
            exceptionToMessage(e, { details, name, streamIn, note }),
          ]
        }

        // Try adding the errors and warnings to the result object, but
        // continue if something goes wrong. If error-reporting has errors
        // then nothing can help us...
        if (newErrors) {
          onEndErrors.push(...newErrors)
          try {
            result.errors.push(...newErrors)
          } catch {
            // Ignore errors when adding errors (e.g., if errors is frozen)
          }
        }
        if (newWarnings) {
          onEndWarnings.push(...newWarnings)
          try {
            result.warnings.push(...newWarnings)
          } catch {
            // Ignore errors when adding warnings (e.g., if warnings is frozen)
          }
        }
      }

      done(onEndErrors, onEndWarnings)
    })()
  }
}

/**
 * Builds the `scheduleOnDisposeCallbacks` function. Each registered
 * `onDispose` callback is dispatched on a fresh call stack so a slow or
 * throwing dispose callback cannot stall the build cleanup path.
 */
export function makeScheduleOnDisposeCallbacks(
  registries: CallbackRegistries,
): () => void {
  return () => {
    // Run each "onDispose" callback with its own call stack
    for (const cb of registries.onDispose) {
      setTimeout(() => cb(), 0)
    }
  }
}
