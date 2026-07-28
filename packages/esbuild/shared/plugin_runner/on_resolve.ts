/**
 * @module
 * Builds the `on-resolve` request callback. Walks the candidate ids in
 * order, runs each callback, and returns the first non-null result. Errors
 * thrown by a callback are surfaced as a single-element `errors` array.
 *
 * @see ./request_callbacks.ts
 */
import type * as protocol from '../stdio_protocol/mod.ts'
import {
  canBeAnything,
  checkForInvalidFlags,
  getFlag,
  mustBeArrayOfStrings,
  mustBeBoolean,
  mustBeString,
  type OptionKeys,
} from '../validation.ts'
import { sanitizeStringArray } from '../message_sanitize.ts'
import type { PluginMessageContext, RequestCallback } from './types.ts'
import { collectPluginMessages, exceptionToMessage } from './messages.ts'
import type { RequestCallbackContext } from './request_callbacks.ts'

/** Builds the `on-resolve` request callback. */
export function makeOnResolveHandler(
  ctx: RequestCallbackContext,
): RequestCallback {
  const { details, registries, streamIn, sendResponse } = ctx
  return async (id, request: protocol.OnResolveRequest) => {
    let response: protocol.OnResolveResponse = {}, name = '', callback, note
    for (const id of request.ids) {
      try {
        ;({ name, callback, note } = registries.onResolve[id]!)
        const result = await callback({
          path: request.path,
          importer: request.importer,
          namespace: request.namespace,
          resolveDir: request.resolveDir,
          kind: request.kind,
          pluginData: details.load(request.pluginData),
          with: request.with,
        })

        if (result != null) {
          if (typeof result !== 'object') {
            throw new Error(
              `Expected onResolve() callback in plugin ${JSON.stringify(name)} to return an object`,
            )
          }
          const keys: OptionKeys = {}
          const pluginName = getFlag(result, keys, 'pluginName', mustBeString)
          const path = getFlag(result, keys, 'path', mustBeString)
          const namespace = getFlag(result, keys, 'namespace', mustBeString)
          const suffix = getFlag(result, keys, 'suffix', mustBeString)
          const external = getFlag(result, keys, 'external', mustBeBoolean)
          const sideEffects = getFlag(
            result,
            keys,
            'sideEffects',
            mustBeBoolean,
          )
          const pluginData = getFlag(result, keys, 'pluginData', canBeAnything)
          const watchFiles = getFlag(
            result,
            keys,
            'watchFiles',
            mustBeArrayOfStrings,
          )
          const watchDirs = getFlag(
            result,
            keys,
            'watchDirs',
            mustBeArrayOfStrings,
          )
          // `errors` and `warnings` are handled by `collectPluginMessages`
          // below; whitelist them here so they don't trip the strict
          // unknown-option check (documented esbuild API).
          keys.errors = true
          keys.warnings = true
          checkForInvalidFlags(
            result,
            keys,
            `from onResolve() callback in plugin ${JSON.stringify(name)}`,
          )

          response.id = id
          if (pluginName != null) response.pluginName = pluginName
          if (path != null) response.path = path
          if (namespace != null) response.namespace = namespace
          if (suffix != null) response.suffix = suffix
          if (external != null) response.external = external
          if (sideEffects != null) response.sideEffects = sideEffects
          if (pluginData != null) {
            response.pluginData = details.store(pluginData)
          }
          if (watchFiles != null) {
            response.watchFiles = sanitizeStringArray(watchFiles, 'watchFiles')
          }
          if (watchDirs != null) {
            response.watchDirs = sanitizeStringArray(watchDirs, 'watchDirs')
          }
          const messages = collectPluginMessages(
            result,
            { details, name, streamIn, note } as PluginMessageContext,
            `from onResolve() callback in plugin ${JSON.stringify(name)}`,
          )
          if (messages.errors) response.errors = messages.errors
          if (messages.warnings) response.warnings = messages.warnings
          break
        }
      } catch (e) {
        response = {
          id,
          errors: [
            exceptionToMessage(e, {
              details,
              name,
              streamIn,
              note,
            }),
          ],
        }
        break
      }
    }
    // Touch `types` to keep the import non-dead for future reader-helper
    // utilities that pull field shapes from this module.
    // The response is narrowed into the wire protocol's value type before
    // being handed back to the channel.
    sendResponse(id, response as protocol.Value)
  }
}
