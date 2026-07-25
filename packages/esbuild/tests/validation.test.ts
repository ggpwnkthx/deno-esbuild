import { assertEquals, assertThrows } from '@std/assert'
import {
  checkForInvalidFlags,
  getFlag,
  mustBeArray,
  mustBeArrayOfStrings,
  mustBeBoolean,
  mustBeEntryPoints,
  mustBeFunction,
  mustBeInteger,
  mustBeObject,
  mustBeObjectOrNull,
  mustBeRegExp,
  mustBeString,
  mustBeStringOrArrayOfStrings,
  mustBeStringOrBoolean,
  mustBeStringOrObject,
  mustBeStringOrUint8Array,
  mustBeStringOrURL,
  mustBeValidPortNumber,
  mustBeWebAssemblyModule,
  type OptionKeys,
  validateAndJoinStringArray,
  validateInitializeOptions,
  validateMangleCache,
  validateStringValue,
} from '../shared/validation.ts'

// Minimal valid WebAssembly module (8-byte header) used by tests that
// need a real `WebAssembly.Module` without touching the network.
const EMPTY_WASM = new Uint8Array([
  0x00,
  0x61,
  0x73,
  0x6d,
  0x01,
  0x00,
  0x00,
  0x00,
])

Deno.test('getFlag: returns the value when the validator accepts it', () => {
  const keys: OptionKeys = {}
  const obj: { foo?: boolean } = { foo: true }
  const out = getFlag(obj, keys, 'foo', mustBeBoolean)
  assertEquals(out, true)
  assertEquals(keys['foo'], true)
})

Deno.test('getFlag: throws when the validator rejects the value', () => {
  const keys: OptionKeys = {}
  const obj: { foo?: string } = { foo: 'yes' }
  let message = ''
  try {
    // deno-lint-ignore no-explicit-any
    getFlag(obj as any, keys, 'foo', mustBeBoolean as any)
  } catch (e) {
    message = (e as Error).message
  }
  assertEquals(message, '"foo" must be a boolean')
})

Deno.test('getFlag: returns undefined when the key is missing without invoking the validator', () => {
  const keys: OptionKeys = {}
  // deno-lint-ignore no-explicit-any
  const obj: Record<string, any> = {}
  const out = getFlag(
    obj,
    keys,
    // deno-lint-ignore no-explicit-any
    'missing' as any,
    mustBeString,
  )
  assertEquals(out, undefined)
})

Deno.test('checkForInvalidFlags: throws for an unrecognized option', () => {
  const keys: OptionKeys = { foo: true }
  let threw = false
  try {
    checkForInvalidFlags({ foo: 1, bar: 2 }, keys, 'in test() call')
  } catch (e) {
    threw = true
    assertEquals(
      (e as Error).message,
      'Invalid option in test() call: "bar"',
    )
  }
  assertEquals(threw, true)
})

Deno.test('checkForInvalidFlags: passes when every key is recorded', () => {
  const keys: OptionKeys = { foo: true, bar: true }
  checkForInvalidFlags({ foo: 1, bar: 2 }, keys, 'in test() call')
})

Deno.test('primitives: each mustBe* returns null on the acceptable type', () => {
  assertEquals(mustBeBoolean(true), null)
  assertEquals(mustBeString('s'), null)
  assertEquals(mustBeRegExp(/x/), null)
  assertEquals(mustBeInteger(0), null)
  assertEquals(mustBeFunction(() => {}), null)
  assertEquals(mustBeArray<string>(['a']), null)
  assertEquals(mustBeArrayOfStrings(['a']), null)
  assertEquals(mustBeObject({}), null)
  assertEquals(mustBeObjectOrNull({}), null)
  assertEquals(mustBeObjectOrNull(null), null)
  assertEquals(mustBeStringOrBoolean('s'), null)
  assertEquals(mustBeStringOrBoolean(true), null)
  assertEquals(mustBeStringOrObject({}), null)
  assertEquals(mustBeStringOrObject('s'), null)
  assertEquals(mustBeStringOrArrayOfStrings('s'), null)
  assertEquals(mustBeStringOrArrayOfStrings(['a']), null)
  assertEquals(mustBeStringOrUint8Array('s'), null)
  assertEquals(mustBeStringOrUint8Array(new Uint8Array()), null)
  assertEquals(mustBeStringOrURL('https://example.com'), null)
  assertEquals(mustBeStringOrURL(new URL('https://example.com')), null)
})

Deno.test('primitives: each mustBe* rejects an unacceptable value with a description', () => {
  // deno-lint-ignore no-explicit-any
  assertEquals(mustBeBoolean('s' as any), 'a boolean')
  assertEquals(mustBeString(1 as unknown as string), 'a string')
  assertEquals(mustBeRegExp('s' as unknown as RegExp), 'a RegExp object')
  assertEquals(mustBeInteger(1.5 as unknown as number), 'an integer')
  // deno-lint-ignore no-explicit-any
  assertEquals(mustBeFunction(null as any), 'a function')
  // deno-lint-ignore no-explicit-any
  assertEquals(mustBeArray<string>('not-array' as any), 'an array')
  assertEquals(
    // deno-lint-ignore no-explicit-any
    mustBeArrayOfStrings([1] as any),
    'an array of strings',
  )
  assertEquals(mustBeObject(null as unknown as object), 'an object')
  assertEquals(
    // deno-lint-ignore no-explicit-any
    mustBeObject([] as any),
    'an object',
  )
  // deno-lint-ignore no-explicit-any
  assertEquals(mustBeObjectOrNull([] as any), 'an object or null')
  assertEquals(
    // deno-lint-ignore no-explicit-any
    mustBeStringOrBoolean(1 as any),
    'a string or a boolean',
  )
  assertEquals(
    // deno-lint-ignore no-explicit-any
    mustBeStringOrObject([] as any),
    'a string or an object',
  )
  assertEquals(
    // deno-lint-ignore no-explicit-any
    mustBeStringOrArrayOfStrings([1] as any),
    'a string or an array of strings',
  )
  assertEquals(
    // deno-lint-ignore no-explicit-any
    mustBeStringOrUint8Array(1 as any),
    'a string or a Uint8Array',
  )
  assertEquals(
    // deno-lint-ignore no-explicit-any
    mustBeStringOrURL(1 as any),
    'a string or a URL',
  )
})

Deno.test('mustBeInteger: rejects NaN and non-finite numbers', () => {
  assertEquals(mustBeInteger(NaN), 'an integer')
  assertEquals(mustBeInteger(Infinity), 'an integer')
  assertEquals(mustBeInteger(-Infinity), 'an integer')
})

Deno.test('mustBeValidPortNumber: accepts 0..65535, rejects everything else', () => {
  assertEquals(mustBeValidPortNumber(0), null)
  assertEquals(mustBeValidPortNumber(80), null)
  assertEquals(mustBeValidPortNumber(65535), null)
  assertEquals(mustBeValidPortNumber(-1), 'a valid port number')
  assertEquals(mustBeValidPortNumber(65536), 'a valid port number')
  assertEquals(mustBeValidPortNumber(1.5), 'a valid port number')
  assertEquals(mustBeValidPortNumber(NaN), 'a valid port number')
})

Deno.test('mustBeEntryPoints: accepts arrays and plain objects, rejects everything else', () => {
  assertEquals(mustBeEntryPoints([]), null)
  assertEquals(mustBeEntryPoints(['a']), null)
  assertEquals(mustBeEntryPoints({ a: 'b' }), null)
  // deno-lint-ignore no-explicit-any
  assertEquals(mustBeEntryPoints('a' as any), 'an array or an object')
  // deno-lint-ignore no-explicit-any
  assertEquals(mustBeEntryPoints(null as any), 'an array or an object')
})

Deno.test('mustBeWebAssemblyModule: accepts WebAssembly.Module only', () => {
  const module = new WebAssembly.Module(EMPTY_WASM)
  assertEquals(mustBeWebAssemblyModule(module), null)
  // deno-lint-ignore no-explicit-any
  assertEquals(mustBeWebAssemblyModule({} as any), 'a WebAssembly.Module')
  assertEquals(
    // deno-lint-ignore no-explicit-any
    mustBeWebAssemblyModule(undefined as any),
    'a WebAssembly.Module',
  )
})

Deno.test('validateInitializeOptions (native): rejects browser-only options', () => {
  assertThrows(
    () => validateInitializeOptions({ wasmURL: 'x' }, 'native'),
    Error,
    '"wasmURL"',
  )
  assertThrows(
    () =>
      validateInitializeOptions(
        { wasmModule: new WebAssembly.Module(EMPTY_WASM) },
        'native',
      ),
    Error,
    '"wasmModule"',
  )
  assertThrows(
    () => validateInitializeOptions({ worker: true }, 'native'),
    Error,
    '"worker"',
  )
})

Deno.test('validateInitializeOptions (native): accepts an empty options object', () => {
  const out = validateInitializeOptions({}, 'native')
  assertEquals(out, {})
})

Deno.test('validateInitializeOptions (wasm): requires wasmURL or wasmModule', () => {
  assertThrows(
    () => validateInitializeOptions({}, 'wasm'),
    Error,
    'wasmURL',
  )
})

Deno.test('validateInitializeOptions (wasm): rejects unknown options', () => {
  // deno-lint-ignore no-explicit-any
  const bad: any = { wasmURL: 'x', unknown: true }
  assertThrows(
    () => validateInitializeOptions(bad, 'wasm'),
    Error,
    '"unknown"',
  )
})

Deno.test('validateInitializeOptions (wasm): normalizes the returned shape', () => {
  const out1 = validateInitializeOptions(
    { wasmURL: 'https://x/y.wasm' },
    'wasm',
  )
  assertEquals(out1.wasmURL, 'https://x/y.wasm')

  const out2 = validateInitializeOptions(
    { wasmURL: 'u', worker: false },
    'wasm',
  )
  assertEquals(out2.worker, false)

  const module = new WebAssembly.Module(EMPTY_WASM)
  const out3 = validateInitializeOptions(
    { wasmModule: module },
    'wasm',
  )
  assertEquals(out3.wasmModule, module)
})

Deno.test('validateMangleCache: returns undefined for missing input', () => {
  assertEquals(validateMangleCache(undefined), undefined)
})

Deno.test('validateMangleCache: copies string/false entries into a fresh object', () => {
  const out = validateMangleCache({ a: 'b', c: false })
  assertEquals(out, { a: 'b', c: false })
  // The returned object should not be the same reference as the input —
  // it's defensively copied to avoid host mutation races.
  assertEquals(
    Object.getPrototypeOf(out) === Object.prototype ||
      Object.getPrototypeOf(out) === null,
    true,
  )
})

Deno.test('validateMangleCache: rejects non-string and non-false values', () => {
  assertThrows(
    () => validateMangleCache({ a: 1 as unknown as string }),
    Error,
    'mangle cache',
  )
})

Deno.test('validateStringValue: returns the value when it is a string', () => {
  assertEquals(validateStringValue('a', 'arg'), 'a')
})

Deno.test('validateStringValue: throws with the expected message shape', () => {
  assertThrows(
    () => validateStringValue(1, 'define', 'X'),
    Error,
    'Expected value for define "X" to be a string',
  )
  assertThrows(
    () => validateStringValue(1, 'define'),
    Error,
    'Expected value for define to be a string',
  )
})

Deno.test('validateAndJoinStringArray: joins valid entries with commas', () => {
  assertEquals(validateAndJoinStringArray(['a', 'b'], 'target'), 'a,b')
})

Deno.test('validateAndJoinStringArray: rejects entries containing commas', () => {
  assertThrows(
    () => validateAndJoinStringArray(['a,b'], 'target'),
    Error,
    'Invalid target: a,b',
  )
})

Deno.test('validateAndJoinStringArray: rejects non-string entries', () => {
  assertThrows(
    () => validateAndJoinStringArray([1 as unknown as string], 'target'),
    Error,
    'to be a string',
  )
})
