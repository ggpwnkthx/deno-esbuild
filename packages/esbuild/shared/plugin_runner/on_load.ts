/**
 * @module
 * Builds the `on-load` request callback. Walks the candidate ids in order,
 * runs each callback, and returns the first non-null result. UTF-8 string
 * contents are encoded before being returned to the service.
 *
 * @see ./request_callbacks.ts
 */
import * as protocol from '../stdio_protocol/mod.ts'
import {
  canBeAnything,
  checkForInvalidFlags,
  getFlag,
  mustBeArrayOfStrings,
  mustBeString,
  mustBeStringOrUint8Array,
  type OptionKeys,
} from '../validation.ts'
import { sanitizeStringArray } from '../message_sanitize.ts'
import type { PluginMessageContext, RequestCallback } from './types.ts'
import { collectPluginMessages, exceptionToMessage } from './messages.ts'
import type { RequestCallbackContext } from './request_callbacks.ts'

/** Builds the `on-load` request callback. */
export function makeOnLoadHandler(
  ctx: RequestCallbackContext,
): RequestCallback {
  const { details, registries, streamIn, sendResponse } = ctx
  return async (id, request: protocol.OnLoadRequest) => {
    let response: protocol.OnLoadResponse = {}, name = '', callback, note
    for (const id of request.ids) {
      try {
        ;({ name, callback, note } = registries.onLoad[id]!)
        const result = await callback({
          path: request.path,
          namespace: request.namespace,
          suffix: request.suffix,
          pluginData: details.load(request.pluginData),
          with: request.with,
        })

        if (result != null) {
          if (typeof result !== 'object') {
            throw new Error(
              `Expected onLoad() callback in plugin ${JSON.stringify(name)} to return an object`,
            )
          }
          const keys: OptionKeys = {}
          const pluginName = getFlag(result, keys, 'pluginName', mustBeString)
          const contents = getFlag(
            result,
            keys,
            'contents',
            mustBeStringOrUint8Array,
          )
          const resolveDir = getFlag(result, keys, 'resolveDir', mustBeString)
          const pluginData = getFlag(result, keys, 'pluginData', canBeAnything)
          const loader = getFlag(result, keys, 'loader', mustBeString)
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
            `from onLoad() callback in plugin ${JSON.stringify(name)}`,
          )

          response.id = id
          if (pluginName != null) response.pluginName = pluginName
          if (contents instanceof Uint8Array) response.contents = contents
          else if (contents != null) {
            response.contents = protocol.encodeUTF8(contents)
          }
          if (resolveDir != null) response.resolveDir = resolveDir
          if (pluginData != null) {
            response.pluginData = details.store(pluginData)
          }
          if (loader != null) response.loader = loader
          if (watchFiles != null) {
            response.watchFiles = sanitizeStringArray(watchFiles, 'watchFiles')
          }
          if (watchDirs != null) {
            response.watchDirs = sanitizeStringArray(watchDirs, 'watchDirs')
          }
          const messages = collectPluginMessages(
            result,
            { details, name, streamIn, note } as PluginMessageContext,
            `from onLoad() callback in plugin ${JSON.stringify(name)}`,
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
    sendResponse(id, response as protocol.Value)
  }
}
