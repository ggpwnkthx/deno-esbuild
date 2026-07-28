/**
 * @module
 * String-coercion helpers used by the flag builder to validate property
 * values and serialize comma-separated entries.
 */

const quote: (x: string) => string = JSON.stringify

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

/** Validates each entry of `values` and joins them with a single comma.
 * Used for flag values that serialize multiple entries into one comma-
 * separated string. */
export function validateAndJoinStringArray(values: string[], what: string): string {
  const toJoin: string[] = []
  for (const value of values) {
    validateStringValue(value, what)
    if (value.indexOf(',') >= 0) throw new Error(`Invalid ${what}: ${value}`)
    toJoin.push(value)
  }
  return toJoin.join(',')
}
