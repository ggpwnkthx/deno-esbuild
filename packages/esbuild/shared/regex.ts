/**
 * @module
 * Cross-runtime regex serialization helpers shared by the flag builder and
 * the plugin runner.
 */

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
