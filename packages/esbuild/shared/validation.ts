/**
 * @module
 * Type guards and option validation primitives used by the rest of the
 * shared transport plumbing.
 *
 * The validators named `mustBe*` return `null` when the value is acceptable
 * and a human-readable description of what was expected otherwise. They are
 * driven by {@link getFlag} which validates a single property of an options
 * object, records the key in a shared `OptionKeys` set, and returns the
 * narrowed value.
 */
import type * as types from './types/mod.ts'

const quote: (x: string) => string = JSON.stringify

/** Bookkeeping set used to track which keys an options object has already
 * validated. Written into by {@link getFlag} and checked by
 * {@link checkForInvalidFlags} to reject unknown options. */
export type OptionKeys = { [key: string]: boolean }

/** Reads, validates, and records a single key from an options object. The
 * `mustBeFn` callback returns `null` for valid values and a human-readable
 * description of the expected type otherwise. */
export function getFlag<T, K extends (keyof T & string)>(
  object: T,
  keys: OptionKeys,
  key: K,
  mustBeFn: (value: T[K]) => string | null,
): T[K] | undefined {
  const value = object[key]
  keys[key + ''] = true
  if (value === undefined) return undefined
  const mustBe = mustBeFn(value)
  if (mustBe !== null) throw new Error(`${quote(key)} must be ${mustBe}`)
  return value
}

/** Throws if `object` has any keys that `keys` does not record. Used after
 * a sequence of {@link getFlag} calls to ensure no unrecognized options
 * were passed. */
export function checkForInvalidFlags(
  object: object,
  keys: OptionKeys,
  where: string,
): void {
  for (const key in object) {
    if (!(key in keys)) {
      throw new Error(`Invalid option ${where}: ${quote(key)}`)
    }
  }
}

/** Validator that accepts any value, including `undefined`. */
export const canBeAnything = (): string | null => null

/** Validator that accepts only `boolean` values. */
export const mustBeBoolean = (value: boolean | undefined): string | null =>
  typeof value === 'boolean' ? null : 'a boolean'

/** Validator that accepts only `string` values. */
export const mustBeString = (value: string | undefined): string | null =>
  typeof value === 'string' ? null : 'a string'

/** Validator that accepts only `RegExp` instances. */
export const mustBeRegExp = (value: RegExp | undefined): string | null =>
  value instanceof RegExp ? null : 'a RegExp object'

/** Validator that accepts only finite integer values. */
export const mustBeInteger = (value: number | undefined): string | null =>
  typeof value === 'number' && value === (value | 0) ? null : 'an integer'

/** Validator that accepts only valid TCP port numbers (0-65535). */
export const mustBeValidPortNumber = (value: number | undefined): string | null =>
  typeof value === 'number' && value === (value | 0) && value >= 0 &&
    value <= 0xFFFF
    ? null
    : 'a valid port number'

/** Validator that accepts only function values. */
export const mustBeFunction = (
  value: (arg0: unknown) => unknown | undefined,
): string | null => typeof value === 'function' ? null : 'a function'

/** Validator that accepts only arrays of `T`. */
export const mustBeArray = <T>(value: T[] | undefined): string | null =>
  Array.isArray(value) ? null : 'an array'

/** Validator that accepts only arrays of `string`. */
export const mustBeArrayOfStrings = (value: string[] | undefined): string | null =>
  Array.isArray(value) && value.every((x) => typeof x === 'string') ? null : 'an array of strings'

/** Validator that accepts only plain objects (not arrays, not null). */
export const mustBeObject = (value: object | undefined): string | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? null : 'an object'

/** Validator that accepts only `array` or `object` (the two shapes
 * `BuildOptions.entryPoints` accepts). */
export const mustBeEntryPoints = (
  value: types.BuildOptions['entryPoints'],
): string | null => typeof value === 'object' && value !== null ? null : 'an array or an object'

/** Validator that accepts only `WebAssembly.Module` instances. */
export const mustBeWebAssemblyModule = (
  value: WebAssembly.Module | undefined,
): string | null => value instanceof WebAssembly.Module ? null : 'a WebAssembly.Module'

/** Validator that accepts only plain objects or `null`. */
export const mustBeObjectOrNull = (value: object | null | undefined): string | null =>
  typeof value === 'object' && !Array.isArray(value) ? null : 'an object or null'

/** Validator that accepts only `string` or `boolean` values. */
export const mustBeStringOrBoolean = (
  value: string | boolean | undefined,
): string | null =>
  typeof value === 'string' || typeof value === 'boolean' ? null : 'a string or a boolean'

/** Validator that accepts only `string` or plain-object values. */
export const mustBeStringOrObject = (
  value: string | object | undefined,
): string | null =>
  typeof value === 'string' ||
    typeof value === 'object' && value !== null && !Array.isArray(value)
    ? null
    : 'a string or an object'

/** Validator that accepts only a `string` or an array of `string`. */
export const mustBeStringOrArrayOfStrings = (
  value: string | string[] | undefined,
): string | null =>
  typeof value === 'string' ||
    (Array.isArray(value) && value.every((x) => typeof x === 'string'))
    ? null
    : 'a string or an array of strings'

/** Validator that accepts only a `string` or a `Uint8Array`. */
export const mustBeStringOrUint8Array = (
  value: string | Uint8Array | undefined,
): string | null =>
  typeof value === 'string' || value instanceof Uint8Array ? null : 'a string or a Uint8Array'

/** Validator that accepts only a `string` or a `URL`. */
export const mustBeStringOrURL = (value: string | URL | undefined): string | null =>
  typeof value === 'string' || value instanceof URL ? null : 'a string or a URL'

/** Discriminator passed to {@link validateInitializeOptions} that picks
 * which set of `initialize()` options is valid. */
export type RuntimeKind = 'native' | 'wasm'

/**
 * Validates and normalizes the options passed to `initialize()`. The runtime
 * discriminator controls which options are accepted: the native transport
 * rejects {@link types.InitializeOptions.wasmURL},
 * {@link types.InitializeOptions.wasmModule}, and
 * {@link types.InitializeOptions.worker} (none of them apply), while the WASM
 * transport requires either a `wasmURL` or a pre-instantiated `wasmModule` and
 * honors the `worker` flag.
 */
export function validateInitializeOptions(
  options: types.InitializeOptions,
  runtime: RuntimeKind = 'native',
): types.InitializeOptions {
  const keys: OptionKeys = Object.create(null)
  const wasmURL = getFlag(options, keys, 'wasmURL', mustBeStringOrURL)
  const wasmModule = getFlag(
    options,
    keys,
    'wasmModule',
    mustBeWebAssemblyModule,
  )
  const worker = getFlag(options, keys, 'worker', mustBeBoolean)
  checkForInvalidFlags(options, keys, 'in initialize() call')

  if (runtime === 'native') {
    if (wasmURL !== undefined) {
      throw new Error(`The "wasmURL" option only works in the browser`)
    }
    if (wasmModule !== undefined) {
      throw new Error(`The "wasmModule" option only works in the browser`)
    }
    if (worker !== undefined) {
      throw new Error(`The "worker" option only works in the browser`)
    }
  } else {
    if (wasmURL === undefined && wasmModule === undefined) {
      throw new Error(`The "wasmURL" or "wasmModule" option is required`)
    }
  }

  const result: types.InitializeOptions = {}
  if (wasmURL !== undefined) result.wasmURL = wasmURL
  if (wasmModule !== undefined) result.wasmModule = wasmModule
  if (worker !== undefined) result.worker = worker
  return result
}

/** Map of property name to either its mangled replacement or `false` to
 * indicate the property should not be mangled. */
export type MangleCache = Record<string, string | false>

/** Combined input shape accepted by both the build and transform flag
 * builders. */
export type CommonOptions = types.BuildOptions | types.TransformOptions

/** Validates `mangleCache` entries and returns a defensively-copied map if
 * any entries are present. Values must be `string` (the mangled name) or
 * `false` (do not mangle). */
export function validateMangleCache(
  mangleCache: MangleCache | undefined,
): MangleCache | undefined {
  let validated: MangleCache | undefined
  if (mangleCache !== undefined) {
    validated = Object.create(null) as MangleCache
    for (const key in mangleCache) {
      const value = mangleCache[key]
      if (typeof value === 'string' || value === false) {
        validated[key] = value
      } else {
        throw new Error(
          `Expected ${quote(key)} in mangle cache to map to either a string or false`,
        )
      }
    }
  }
  return validated
}

// Back-compat re-exports: `validateStringValue` and `validateAndJoinStringArray`
// moved into `shared/string_helpers.ts`, and `jsRegExpToGoRegExp` moved into
// `shared/regex.ts`. Existing test imports from `shared/validation.ts` keep
// resolving through these shims.
export { validateAndJoinStringArray, validateStringValue } from './string_helpers.ts'
export { jsRegExpToGoRegExp } from './regex.ts'
