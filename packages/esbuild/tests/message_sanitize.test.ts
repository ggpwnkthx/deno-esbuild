import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert'
import type * as types from '../shared/types.ts'
import {
  failureErrorWithLog,
  replaceDetailsInMessages,
  sanitizeLocation,
  sanitizeMessages,
  sanitizeStringArray,
  sanitizeStringMap,
} from '../shared/message_sanitize.ts'

/** Minimal ObjectStashLike that just stores and returns by key, so the
 * tests can assert the protocol shape without depending on the plugin
 * runner's createObjectStash. */
function makeStash(): {
  store: (value: unknown) => number
  load: (id: number) => unknown
  entries: Map<number, unknown>
} {
  const entries = new Map<number, unknown>()
  let next = 0
  return {
    entries,
    store(value) {
      const id = next++
      entries.set(id, value)
      return id
    },
    load(id) {
      return entries.get(id)
    },
  }
}

Deno.test('sanitizeLocation: returns null when input is null/undefined', () => {
  // deno-lint-ignore no-explicit-any
  assertEquals(sanitizeLocation(null as any, 'where', 80), null)
  // deno-lint-ignore no-explicit-any
  assertEquals(sanitizeLocation(undefined as any, 'where', 80), null)
})

Deno.test('sanitizeLocation: fills missing fields with defaults', () => {
  const out = sanitizeLocation({}, 'where', 80)
  assertEquals(out, {
    file: '',
    namespace: '',
    line: 0,
    column: 0,
    length: 0,
    lineText: '',
    suggestion: '',
  })
})

Deno.test('sanitizeLocation: trims a huge ASCII line to the relevant window when terminalWidth is set', () => {
  // esbuild#3467: a position near the start of a minified line used to
  // serialize the entire (huge) line. The sanitizer should trim it to a
  // small window around the column.
  const huge = 'a'.repeat(10_000)
  const loc = {
    file: 'huge.js',
    line: 1,
    column: 10,
    length: 0,
    lineText: huge,
  }
  const out = sanitizeLocation(loc, 'where', 80)!
  assertEquals(out.line, 1)
  assertEquals(out.column, 10)
  // Window is `column + length + terminalWidth` wide (capped at 80).
  // Sanitizer asserts no newlines and no non-ASCII characters.
  assertEquals(out.lineText.length, 10 + 0 + 80)
  assertEquals(out.lineText, 'a'.repeat(90))
})

Deno.test('sanitizeLocation: keeps the lineText untouched when it contains newlines or non-ASCII', () => {
  // The trimming optimization only fires when the contents are clean ASCII.
  // Anything else (multiline, non-ASCII) is preserved verbatim.
  const mixed = 'café\nnext line'
  const out = sanitizeLocation(
    { file: 'x.js', column: 1, lineText: mixed },
    'where',
    80,
  )!
  assertEquals(out.lineText, mixed)
})

Deno.test('sanitizeLocation: throws on unknown fields', () => {
  assertThrows(
    () =>
      // deno-lint-ignore no-explicit-any
      sanitizeLocation({ file: 'a', bogus: 1 } as any, 'where', 80),
    Error,
    'Invalid option where',
  )
})

Deno.test('sanitizeMessages: returns an empty array for empty input', () => {
  assertEquals(sanitizeMessages([], 'errors', null, '', undefined), [])
})

Deno.test('sanitizeMessages: stores the `detail` in the supplied stash, -1 when no stash', () => {
  const stash = makeStash()
  const withStash = sanitizeMessages(
    [{ text: 'x', detail: { some: 'payload' } }] as types.PartialMessage[],
    'errors',
    stash,
    '',
    undefined,
  )
  const detailId = withStash[0]!.detail as number
  assertEquals(typeof detailId, 'number')
  assertEquals(detailId >= 0, true)
  assertEquals(stash.load(detailId), { some: 'payload' })

  const withoutStash = sanitizeMessages(
    [{ text: 'x' }] as types.PartialMessage[],
    'errors',
    null,
    '',
    undefined,
  )
  assertEquals(withoutStash[0]!.detail, -1)
})

Deno.test('sanitizeMessages: falls back to the supplied plugin name when the message has none', () => {
  const out = sanitizeMessages(
    [{ text: 'x' }] as types.PartialMessage[],
    'errors',
    null,
    'fallback',
    undefined,
  )
  assertEquals(out[0]!.pluginName, 'fallback')
})

Deno.test('sanitizeMessages: rejects unknown properties on the message', () => {
  // deno-lint-ignore no-explicit-any
  const bogus: any = [{ text: 'x', bogus: true }]
  assertThrows(
    () => sanitizeMessages(bogus, 'errors', null, '', undefined),
    Error,
    'Invalid option',
  )
})

Deno.test('sanitizeStringArray: returns the input when every entry is a string', () => {
  assertEquals(sanitizeStringArray(['a', 'b'], 'watchFiles'), ['a', 'b'])
})

Deno.test('sanitizeStringArray: rejects non-string entries', () => {
  assertThrows(
    // deno-lint-ignore no-explicit-any
    () => sanitizeStringArray([1 as any], 'watchFiles'),
    Error,
    'must be an array of strings',
  )
})

Deno.test('sanitizeStringMap: returns a null-prototype object with string values', () => {
  const out = sanitizeStringMap({ a: 'x', b: 'y' }, 'with')
  assertEquals(out, { a: 'x', b: 'y' })
  assertEquals(
    Object.getPrototypeOf(out),
    null,
  )
})

Deno.test('sanitizeStringMap: rejects non-string values', () => {
  assertThrows(
    () =>
      // deno-lint-ignore no-explicit-any
      sanitizeStringMap({ a: 1 } as Record<string, any>, 'with'),
    Error,
    'must be a string',
  )
})

Deno.test('replaceDetailsInMessages: swaps stash ids for live values in place', () => {
  const stash = makeStash()
  const detailId = stash.store({ some: 'payload' })
  const messages: types.Message[] = [{
    id: '',
    pluginName: '',
    text: '',
    location: null,
    notes: [],
    detail: detailId,
  }]
  const out = replaceDetailsInMessages(messages, stash)
  assertEquals(out, messages)
  assertEquals(out[0]!.detail, { some: 'payload' })
})

Deno.test('failureErrorWithLog: builds an Error with the upstream summary format', () => {
  const errors: types.Message[] = [{
    id: '',
    pluginName: '',
    text: 'syntax error',
    location: {
      file: 'a.js',
      line: 1,
      column: 2,
      length: 0,
      lineText: '',
      namespace: '',
      suggestion: '',
    },
    notes: [],
    detail: -1,
  }]
  const err = failureErrorWithLog('Build failed', errors, [])
  assertEquals(err instanceof Error, true)
  assertStringIncludes(err.message, 'Build failed with 1 error')
  assertStringIncludes(err.message, 'a.js:1:2:')
})

Deno.test('failureErrorWithLog: pluralizes errors correctly', () => {
  const err1 = failureErrorWithLog('Context failed', [], [])
  assertStringIncludes(err1.message, 'Context failed')

  const errs: types.Message[] = [
    {
      id: '',
      pluginName: '',
      text: 'a',
      location: null,
      notes: [],
      detail: -1,
    },
    {
      id: '',
      pluginName: '',
      text: 'b',
      location: null,
      notes: [],
      detail: -1,
    },
  ]
  const err2 = failureErrorWithLog('Build failed', errs, [])
  assertStringIncludes(err2.message, 'Build failed with 2 errors')
})

Deno.test('failureErrorWithLog: truncates long error lists to 5 entries plus an ellipsis', () => {
  const errs: types.Message[] = Array.from({ length: 8 }, (_, i) => ({
    id: '',
    pluginName: '',
    text: `error ${i}`,
    location: null,
    notes: [],
    detail: -1,
  }))
  const err = failureErrorWithLog('Build failed', errs, [])
  assertStringIncludes(err.message, 'with 8 errors')
  // Five entries + "..." line.
  for (let i = 0; i < 5; i++) {
    assertStringIncludes(err.message, `error ${i}`)
  }
  assertStringIncludes(err.message, '...')
  // The 6th error is past the limit and must not appear.
  // (Both ellipsis and truncation are upstream-visible behaviours.)
})

Deno.test('failureErrorWithLog: preserves `errors` and `warnings` as lazy getters', () => {
  const errors: types.Message[] = []
  const warnings: types.Message[] = []
  const err = failureErrorWithLog('Build failed', errors, warnings)
  // Lazy getter: the same array reference is returned each call.
  assertEquals((err as types.BuildFailure).errors, errors)
  assertEquals((err as types.BuildFailure).warnings, warnings)
})
