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
import type * as types from './types.ts'

const quote: (x: string) => string = JSON.stringify

export type OptionKeys = { [key: string]: boolean }

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

export const canBeAnything = (): string | null => null

export const mustBeBoolean = (value: boolean | undefined): string | null =>
  typeof value === 'boolean' ? null : 'a boolean'

export const mustBeString = (value: string | undefined): string | null =>
  typeof value === 'string' ? null : 'a string'

export const mustBeRegExp = (value: RegExp | undefined): string | null =>
  value instanceof RegExp ? null : 'a RegExp object'

export const mustBeInteger = (value: number | undefined): string | null =>
  typeof value === 'number' && value === (value | 0) ? null : 'an integer'

export const mustBeValidPortNumber = (value: number | undefined): string | null =>
  typeof value === 'number' && value === (value | 0) && value >= 0 &&
    value <= 0xFFFF
    ? null
    : 'a valid port number'

export const mustBeFunction = (
  value: (arg0: unknown) => unknown | undefined,
): string | null => typeof value === 'function' ? null : 'a function'

export const mustBeArray = <T>(value: T[] | undefined): string | null =>
  Array.isArray(value) ? null : 'an array'

export const mustBeArrayOfStrings = (value: string[] | undefined): string | null =>
  Array.isArray(value) && value.every((x) => typeof x === 'string') ? null : 'an array of strings'

export const mustBeObject = (value: object | undefined): string | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? null : 'an object'

export const mustBeEntryPoints = (
  value: types.BuildOptions['entryPoints'],
): string | null => typeof value === 'object' && value !== null ? null : 'an array or an object'

export const mustBeWebAssemblyModule = (
  value: WebAssembly.Module | undefined,
): string | null => value instanceof WebAssembly.Module ? null : 'a WebAssembly.Module'

export const mustBeObjectOrNull = (value: object | null | undefined): string | null =>
  typeof value === 'object' && !Array.isArray(value) ? null : 'an object or null'

export const mustBeStringOrBoolean = (
  value: string | boolean | undefined,
): string | null =>
  typeof value === 'string' || typeof value === 'boolean' ? null : 'a string or a boolean'

export const mustBeStringOrObject = (
  value: string | object | undefined,
): string | null =>
  typeof value === 'string' ||
    typeof value === 'object' && value !== null && !Array.isArray(value)
    ? null
    : 'a string or an object'

export const mustBeStringOrArrayOfStrings = (
  value: string | string[] | undefined,
): string | null =>
  typeof value === 'string' ||
    (Array.isArray(value) && value.every((x) => typeof x === 'string'))
    ? null
    : 'a string or an array of strings'

export const mustBeStringOrUint8Array = (
  value: string | Uint8Array | undefined,
): string | null =>
  typeof value === 'string' || value instanceof Uint8Array ? null : 'a string or a Uint8Array'

export const mustBeStringOrURL = (value: string | URL | undefined): string | null =>
  typeof value === 'string' || value instanceof URL ? null : 'a string or a URL'

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

export type MangleCache = Record<string, string | false>

export type CommonOptions = types.BuildOptions | types.TransformOptions

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

/**
 * Coerces a value to a string and throws a descriptive error if it is not.
 * Used by flag builders that need a string property value but reject
 * non-string values via a generic `mustBeX` guard.
 */
export function validateStringValue(
  value: unknown,
  what: string,
  key?: string,
): string {
  if (typeof value !== 'string') {
    throw new Error(
      `Expected value for ${what}${
        key !== void 0 ? ' ' + quote(key) : ''
      } to be a string, got ${typeof value} instead`,
    )
  }
  return value
}

export function validateAndJoinStringArray(values: string[], what: string): string {
  const toJoin: string[] = []
  for (const value of values) {
    validateStringValue(value, what)
    if (value.indexOf(',') >= 0) throw new Error(`Invalid ${what}: ${value}`)
    toJoin.push(value)
  }
  return toJoin.join(',')
}

/**
 * Converts a JavaScript regular expression to the Go RE2 syntax used by the
 * esbuild service. The conversion is intentionally minimal: it just threads
 * the JS regex flags after the `(?...)` Go prefix.
 */
export function jsRegExpToGoRegExp(regexp: RegExp): string {
  let result = regexp.source
  if (regexp.flags) result = `(?${regexp.flags})${result}`
  return result
}
