/**
 * @module
 * Builds the `on-start` request callback. Clears the object stash before
 * each build (so old `pluginData` references don't leak) and fans out to
 * every registered plugin callback.
 *
 * @see ./request_callbacks.ts
 */
import type * as protocol from '../stdio_protocol/mod.ts'
import type { PluginMessageContext, RequestCallback } from './types.ts'
import { collectPluginMessages, exceptionToMessage } from './messages.ts'
import type { RequestCallbackContext } from './request_callbacks.ts'

/** Builds the `on-start` request callback. */
export function makeOnStartHandler(
  ctx: RequestCallbackContext,
): RequestCallback {
  const { details, registries, streamIn, sendResponse } = ctx
  return async (id, _request: protocol.OnStartRequest) => {
    // Reset the "pluginData" map before each new build to avoid a memory
    // leak. This is done before each new build begins instead of after each
    // build ends because I believe the current API doesn't restrict when you
    // can call "resolve" and there may be some uses of it that call it
    // around when the build ends, and we don't want to accidentally break
    // those use cases.
    details.clear()

    const response: protocol.OnStartResponse = { errors: [], warnings: [] }
    await Promise.all(
      registries.onStart.map(async ({ name, callback, note }) => {
        const msgCtx: PluginMessageContext = {
          details,
          name,
          streamIn,
          note,
        }
        try {
          const result = await callback()
          const { errors, warnings } = collectPluginMessages(
            result,
            msgCtx,
            `from onStart() callback in plugin ${JSON.stringify(name)}`,
          )
          if (errors) response.errors!.push(...errors)
          if (warnings) response.warnings!.push(...warnings)
        } catch (e) {
          response.errors!.push(exceptionToMessage(e, msgCtx))
        }
      }),
    )
    sendResponse(id, response as protocol.Value)
  }
}
