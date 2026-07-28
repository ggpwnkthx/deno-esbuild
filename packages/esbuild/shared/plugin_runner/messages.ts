/**
 * @module
 * Plugin-message collection and exception-to-message helpers used by the
 * plugin runner when normalizing plugin callback returns.
 *
 * @see ./types.ts
 * @see ../message_sanitize.ts
 * @see ../v8_stack.ts
 */
import type * as types from '../types/mod.ts'
import { sanitizeMessages } from '../message_sanitize.ts'
import { extractErrorMessageV8 } from '../v8_stack.ts'
import type { PluginMessageContext } from './types.ts'

/**
 * Sanitizes the `errors` and `warnings` returns of a plugin callback result.
 * Returns `[errors, warnings]` where each element is either the sanitized
 * array or `undefined` if the callback returned nothing for that field.
 *
 * If the callback threw, the throw value is converted into a `types.Message`
 * via `extractErrorMessageV8` and surfaced as a single error.
 */
export function collectPluginMessages(
  result: unknown,
  ctx: PluginMessageContext,
  propertyWhere: string,
): {
  errors: types.Message[] | undefined
  warnings: types.Message[] | undefined
} {
  if (result == null) {
    return { errors: undefined, warnings: undefined }
  }
  if (typeof result !== 'object') {
    throw new Error(
      `Expected ${propertyWhere} to return an object`,
    )
  }
  const record = result as { [key: string]: unknown }
  const errors = (record.errors as unknown[] | undefined) ?? undefined
  const warnings = (record.warnings as unknown[] | undefined) ?? undefined
  return {
    errors: errors != null
      ? sanitizeMessages(
        errors as types.PartialMessage[],
        'errors',
        ctx.details,
        ctx.name,
        undefined,
      )
      : undefined,
    warnings: warnings != null
      ? sanitizeMessages(
        warnings as types.PartialMessage[],
        'warnings',
        ctx.details,
        ctx.name,
        undefined,
      )
      : undefined,
  }
}

/**
 * Converts an exception thrown by a plugin callback into a `types.Message`
 * with the registration `Note` attached. Mirrors the four `catch (e)` blocks
 * that previously lived at the call sites.
 */
export function exceptionToMessage(
  e: unknown,
  ctx: PluginMessageContext,
): types.Message {
  return extractErrorMessageV8(
    e,
    ctx.streamIn,
    ctx.details,
    ctx.note ? ctx.note() : undefined,
    ctx.name,
  )
}
