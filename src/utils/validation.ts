const quote = JSON.stringify;

/**
 * A validation function that always returns null, accepting any value.
 * Used for optional parameters that can be omitted.
 */
export const canBeAnything = (): null => null;

/**
 * Validates that a value is a boolean.
 * @param value - The value to validate
 * @returns null if valid, or an error message string if invalid
 */
export const mustBeBoolean = (value: unknown): string | null =>
  typeof value === "boolean" ? null : "a boolean";

/**
 * Validates that a value is a string.
 * @param value - The value to validate
 * @returns null if valid, or an error message string if invalid
 */
export const mustBeString = (value: unknown): string | null =>
  typeof value === "string" ? null : "a string";

/**
 * Validates that a value is a RegExp object.
 * @param value - The value to validate
 * @returns null if valid, or an error message string if invalid
 */
export const mustBeRegExp = (value: unknown): string | null =>
  value instanceof RegExp ? null : "a RegExp object";

/**
 * Validates that a value is an integer.
 * @param value - The value to validate
 * @returns null if valid, or an error message string if invalid
 */
export const mustBeInteger = (value: unknown): string | null =>
  typeof value === "number" && value === (value | 0) ? null : "an integer";

/**
 * Validates that a value is a valid port number (0-65535).
 * @param value - The value to validate
 * @returns null if valid, or an error message string if invalid
 */
export const mustBeValidPortNumber = (value: unknown): string | null =>
  typeof value === "number" && value === (value | 0) && value >= 0 && value <= 65535
    ? null
    : "a valid port number";

/**
 * Validates that a value is a function.
 * @param value - The value to validate
 * @returns null if valid, or an error message string if invalid
 */
export const mustBeFunction = (value: unknown): string | null =>
  typeof value === "function" ? null : "a function";

/**
 * Validates that a value is an array.
 * @param value - The value to validate
 * @returns null if valid, or an error message string if invalid
 */
export const mustBeArray = (value: unknown): string | null =>
  Array.isArray(value) ? null : "an array";

/**
 * Validates that a value is an array of strings.
 * @param value - The value to validate
 * @returns null if valid, or an error message string if invalid
 */
export const mustBeArrayOfStrings = (value: unknown): string | null =>
  Array.isArray(value) && (value as string[]).every((x) => typeof x === "string")
    ? null
    : "an array of strings";

/**
 * Validates that a value is a plain object (not null, not an array).
 * @param value - The value to validate
 * @returns null if valid, or an error message string if invalid
 */
export const mustBeObject = (value: unknown): string | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? null
    : "an object";

/**
 * Validates that a value is an object or null (used for entryPoints).
 * @param value - The value to validate
 * @returns null if valid, or an error message string if invalid
 */
export const mustBeEntryPoints = (value: unknown): string | null =>
  typeof value === "object" && value !== null ? null : "an array or an object";

/**
 * Validates that a value is a WebAssembly.Module.
 * @param value - The value to validate
 * @returns null if valid, or an error message string if invalid
 */
export const mustBeWebAssemblyModule = (value: unknown): string | null =>
  value instanceof WebAssembly.Module ? null : "a WebAssembly.Module";

/**
 * Validates that a value is a plain object or null.
 * @param value - The value to validate
 * @returns null if valid, or an error message string if invalid
 */
export const mustBeObjectOrNull = (value: unknown): string | null =>
  typeof value === "object" && !Array.isArray(value) ? null : "an object or null";

/**
 * Validates that a value is a string or a boolean.
 * @param value - The value to validate
 * @returns null if valid, or an error message string if invalid
 */
export const mustBeStringOrBoolean = (value: unknown): string | null =>
  typeof value === "string" || typeof value === "boolean"
    ? null
    : "a string or a boolean";

/**
 * Validates that a value is a string or a plain object.
 * @param value - The value to validate
 * @returns null if valid, or an error message string if invalid
 */
export const mustBeStringOrObject = (value: unknown): string | null =>
  typeof value === "string"
    || (typeof value === "object" && value !== null && !Array.isArray(value)
      ? true
      : false)
    ? null
    : "a string or an object";

/**
 * Validates that a value is a string or an array of strings.
 * @param value - The value to validate
 * @returns null if valid, or an error message string if invalid
 */
export const mustBeStringOrArrayOfStrings = (value: unknown): string | null =>
  typeof value === "string"
    || (Array.isArray(value) && (value as string[]).every((x) => typeof x === "string"))
    ? null
    : "a string or an array of strings";

/**
 * Validates that a value is a string or a Uint8Array.
 * @param value - The value to validate
 * @returns null if valid, or an error message string if invalid
 */
export const mustBeStringOrUint8Array = (value: unknown): string | null =>
  typeof value === "string" || value instanceof Uint8Array
    ? null
    : "a string or a Uint8Array";

/**
 * Validates that a value is a string or a URL.
 * @param value - The value to validate
 * @returns null if valid, or an error message string if invalid
 */
export const mustBeStringOrURL = (value: unknown): string | null =>
  typeof value === "string" || value instanceof URL ? null : "a string or a URL";

/**
 * Extracts and validates a flag value from an object, marking the key as used.
 * @param object - The object to extract the flag from
 * @param keys - Record to track which keys have been used
 * @param key - The key to extract
 * @param mustBeFn - Validation function to apply
 * @returns The extracted value, or undefined if not present
 * @throws Error if the value fails validation
 */
export function getFlag<T>(
  object: Record<string, unknown>,
  keys: Record<string, boolean>,
  key: string,
  mustBeFn: (value: unknown) => string | null,
): T | undefined {
  const value = object[key];
  keys[key + ""] = true;
  if (value === void 0) return undefined;
  const mustBe = mustBeFn(value);
  if (mustBe !== null) throw new Error(`${quote(key)} must be ${mustBe}`);
  return value as T;
}

/**
 * Checks an object for any keys that were not explicitly retrieved via getFlag.
 * @param object - The object to check
 * @param keys - Record of keys that were explicitly retrieved
 * @param where - Description of where this check is happening (for error messages)
 * @throws Error if any invalid (unrecognized) keys are found
 */
export function checkForInvalidFlags(
  object: Record<string, unknown>,
  keys: Record<string, boolean>,
  where: string,
): void {
  for (const key in object) {
    if (!(key in keys)) {
      throw new Error(`Invalid option ${where}: ${quote(key)}`);
    }
  }
}

/**
 * Validates that a value is a string, throwing an error with context if not.
 * @param value - The value to validate
 * @param what - Description of what is being validated (for error messages)
 * @param key - Optional key to include in the error message
 * @returns The validated string value
 * @throws Error if the value is not a string
 */
export function validateStringValue(
  value: unknown,
  what: string,
  key?: string,
): string {
  if (typeof value !== "string") {
    throw new Error(
      `Expected value for ${what}${
        key !== void 0 ? " " + quote(key) : ""
      } to be a string, got ${typeof value} instead`,
    );
  }
  return value;
}

/**
 * Validates an array of strings and joins them into a comma-separated string.
 * @param values - The array of strings to validate and join
 * @param what - Description of what is being validated (for error messages)
 * @returns A comma-separated string of the validated values
 * @throws Error if any value is not a string or contains a comma
 */
export function validateAndJoinStringArray(values: string[], what: string): string {
  const toJoin: string[] = [];
  for (const value of values) {
    validateStringValue(value, what);
    if (value.indexOf(",") >= 0) {
      throw new Error(`Invalid ${what}: ${value}`);
    }
    toJoin.push(value);
  }
  return toJoin.join(",");
}

/**
 * Validates the options passed to the initialize function.
 * @param options - The initialize options to validate
 * @returns The validated and normalized options object
 * @throws Error if any option fails validation or unknown options are present
 */
export function validateInitializeOptions(options: {
  wasmURL?: string | URL;
  wasmModule?: WebAssembly.Module;
  worker?: boolean;
}): {
  wasmURL: string | URL | undefined;
  wasmModule: WebAssembly.Module | undefined;
  worker: boolean | undefined;
} {
  const keys: Record<string, boolean> = {};
  const wasmURL = getFlag<string | URL>(options, keys, "wasmURL", mustBeStringOrURL);
  const wasmModule = getFlag<WebAssembly.Module>(
    options,
    keys,
    "wasmModule",
    mustBeWebAssemblyModule,
  );
  const worker = getFlag<boolean>(options, keys, "worker", mustBeBoolean);
  checkForInvalidFlags(options, keys, "in initialize() call");
  return {
    wasmURL,
    wasmModule,
    worker,
  };
}

/**
 * Validates a mangleCache object, ensuring all values are strings or false.
 * @param mangleCache - The mangleCache object to validate
 * @returns The validated mangleCache, or undefined if input was undefined
 * @throws Error if any value in the cache is neither a string nor false
 */
export function validateMangleCache(
  mangleCache: Record<string, string | false> | undefined,
): Record<string, string | false> | undefined {
  let validated: Record<string, string | false> | undefined;
  if (mangleCache !== void 0) {
    validated = Object.create(null) as Record<string, string | false>;
    for (const key in mangleCache) {
      const value = mangleCache[key];
      if (typeof value === "string" || value === false) {
        validated[key] = value;
      } else {
        throw new Error(
          `Expected ${quote(key)} in mangle cache to map to either a string or false`,
        );
      }
    }
  }
  return validated;
}

/**
 * Validates that an array contains only strings.
 * @param values - The array to validate
 * @param property - Description of the property being validated (for error messages)
 * @returns The validated array of strings
 * @throws Error if any element is not a string
 */
export function sanitizeStringArray(values: string[], property: string): string[] {
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") {
      throw new Error(`${quote(property)} must be an array of strings`);
    }
    result.push(value);
  }
  return result;
}

/**
 * Validates that all values in a string-to-string map are strings.
 * @param map - The map to validate
 * @param property - Description of the property being validated (for error messages)
 * @returns A new validated string-to-string map
 * @throws Error if any value in the map is not a string
 */
export function sanitizeStringMap(
  map: Record<string, string>,
  property: string,
): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  for (const key in map) {
    const value = map[key];
    if (typeof value !== "string") {
      throw new Error(
        `key ${quote(key)} in object ${quote(property)} must be a string`,
      );
    }
    result[key] = value;
  }
  return result;
}

/**
 * Converts a JavaScript RegExp to a Go-style RegExp string for esbuild.
 * Handles the `d`, `s`, and `m` flags which have different syntax in Go.
 * @param regexp - The JavaScript regular expression to convert
 * @returns A Go-style regex string
 */
export function jsRegExpToGoRegExp(regexp: RegExp): string {
  let result = regexp.source;
  if (regexp.flags) result = `(?${regexp.flags})${result}`;
  return result;
}
