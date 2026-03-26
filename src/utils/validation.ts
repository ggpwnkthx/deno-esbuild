const quote = JSON.stringify;

export const canBeAnything = (): null => null;

export const mustBeBoolean = (value: unknown): string | null =>
  typeof value === "boolean" ? null : "a boolean";

export const mustBeString = (value: unknown): string | null =>
  typeof value === "string" ? null : "a string";

export const mustBeRegExp = (value: unknown): string | null =>
  value instanceof RegExp ? null : "a RegExp object";

export const mustBeInteger = (value: unknown): string | null =>
  typeof value === "number" && value === (value | 0) ? null : "an integer";

export const mustBeValidPortNumber = (value: unknown): string | null =>
  typeof value === "number" && value === (value | 0) && value >= 0 && value <= 65535
    ? null
    : "a valid port number";

export const mustBeFunction = (value: unknown): string | null =>
  typeof value === "function" ? null : "a function";

export const mustBeArray = (value: unknown): string | null =>
  Array.isArray(value) ? null : "an array";

export const mustBeArrayOfStrings = (value: unknown): string | null =>
  Array.isArray(value) && (value as string[]).every((x) => typeof x === "string")
    ? null
    : "an array of strings";

export const mustBeObject = (value: unknown): string | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? null
    : "an object";

export const mustBeEntryPoints = (value: unknown): string | null =>
  typeof value === "object" && value !== null ? null : "an array or an object";

export const mustBeWebAssemblyModule = (value: unknown): string | null =>
  value instanceof WebAssembly.Module ? null : "a WebAssembly.Module";

export const mustBeObjectOrNull = (value: unknown): string | null =>
  typeof value === "object" && !Array.isArray(value) ? null : "an object or null";

export const mustBeStringOrBoolean = (value: unknown): string | null =>
  typeof value === "string" || typeof value === "boolean"
    ? null
    : "a string or a boolean";

export const mustBeStringOrObject = (value: unknown): string | null =>
  typeof value === "string"
    || (typeof value === "object" && value !== null && !Array.isArray(value)
      ? true
      : false)
    ? null
    : "a string or an object";

export const mustBeStringOrArrayOfStrings = (value: unknown): string | null =>
  typeof value === "string"
    || (Array.isArray(value) && (value as string[]).every((x) => typeof x === "string"))
    ? null
    : "a string or an array of strings";

export const mustBeStringOrUint8Array = (value: unknown): string | null =>
  typeof value === "string" || value instanceof Uint8Array
    ? null
    : "a string or a Uint8Array";

export const mustBeStringOrURL = (value: unknown): string | null =>
  typeof value === "string" || value instanceof URL ? null : "a string or a URL";

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

export function jsRegExpToGoRegExp(regexp: RegExp): string {
  let result = regexp.source;
  if (regexp.flags) result = `(?${regexp.flags})${result}`;
  return result;
}
