import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.19";
import {
  canBeAnything,
  checkForInvalidFlags,
  getFlag,
  jsRegExpToGoRegExp,
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
  sanitizeStringArray,
  sanitizeStringMap,
  validateAndJoinStringArray,
  validateInitializeOptions,
  validateMangleCache,
  validateStringValue,
} from "@ggpwnkthx/esbuild/utils";

const emptyWasmModule = new WebAssembly.Module(
  new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]),
);

Deno.test("mustBeBoolean() accepts booleans and rejects non-booleans", () => {
  assertEquals(mustBeBoolean(true), null);
  assertEquals(mustBeBoolean(false), null);
  assertEquals(mustBeBoolean(1), "a boolean");
  assertEquals(mustBeBoolean("true"), "a boolean");
  assertEquals(mustBeBoolean(null), "a boolean");
  assertEquals(mustBeBoolean({}), "a boolean");
});

Deno.test("mustBeString() accepts strings and rejects non-strings", () => {
  assertEquals(mustBeString("hello"), null);
  assertEquals(mustBeString(""), null);
  assertEquals(mustBeString(1), "a string");
  assertEquals(mustBeString(true), "a string");
  assertEquals(mustBeString(null), "a string");
  assertEquals(mustBeString({}), "a string");
});

Deno.test("mustBeRegExp() accepts RegExp and rejects non-RegExp", () => {
  assertEquals(mustBeRegExp(/abc/), null);
  assertEquals(mustBeRegExp(new RegExp("")), null);
  assertEquals(mustBeRegExp("abc"), "a RegExp object");
  assertEquals(mustBeRegExp(1), "a RegExp object");
  assertEquals(mustBeRegExp(null), "a RegExp object");
  assertEquals(mustBeRegExp({}), "a RegExp object");
});

Deno.test("mustBeInteger() accepts integers and rejects floats", () => {
  assertEquals(mustBeInteger(0), null);
  assertEquals(mustBeInteger(-1), null);
  assertEquals(mustBeInteger(42), null);
  assertEquals(mustBeInteger(1e3), null);
  assertEquals(mustBeInteger(1.5), "an integer");
  assertEquals(mustBeInteger("1"), "an integer");
  assertEquals(mustBeInteger(NaN), "an integer");
  assertEquals(mustBeInteger(Infinity), "an integer");
});

Deno.test("mustBeValidPortNumber() accepts 0 and 65535, rejects -1, 65536, and floats", () => {
  assertEquals(mustBeValidPortNumber(0), null);
  assertEquals(mustBeValidPortNumber(80), null);
  assertEquals(mustBeValidPortNumber(65535), null);
  assertEquals(mustBeValidPortNumber(-1), "a valid port number");
  assertEquals(mustBeValidPortNumber(65536), "a valid port number");
  assertEquals(mustBeValidPortNumber(1.5), "a valid port number");
  assertEquals(mustBeValidPortNumber("80"), "a valid port number");
  assertEquals(mustBeValidPortNumber(NaN), "a valid port number");
});

Deno.test("mustBeFunction() accepts functions and rejects non-functions", () => {
  assertEquals(mustBeFunction(() => {}), null);
  assertEquals(mustBeFunction(function () {}), null);
  assertEquals(mustBeFunction(class {}), null);
  assertEquals(mustBeFunction("fn"), "a function");
  assertEquals(mustBeFunction(1), "a function");
  assertEquals(mustBeFunction(null), "a function");
  assertEquals(mustBeFunction({}), "a function");
});

Deno.test("mustBeArray() accepts arrays and rejects non-arrays", () => {
  assertEquals(mustBeArray([]), null);
  assertEquals(mustBeArray([1]), null);
  assertEquals(mustBeArray([1, "a"]), null);
  assertEquals(mustBeArray({}), "an array");
  assertEquals(mustBeArray("[]"), "an array");
  assertEquals(mustBeArray(null), "an array");
  assertEquals(mustBeArray(1), "an array");
});

Deno.test("mustBeArrayOfStrings() accepts only arrays of strings", () => {
  assertEquals(mustBeArrayOfStrings([]), null);
  assertEquals(mustBeArrayOfStrings(["a"]), null);
  assertEquals(mustBeArrayOfStrings(["a", "b"]), null);
  assertEquals(mustBeArrayOfStrings([1]), "an array of strings");
  assertEquals(mustBeArrayOfStrings(["a", 1]), "an array of strings");
  assertEquals(mustBeArrayOfStrings(["a", null]), "an array of strings");
  assertEquals(mustBeArrayOfStrings({}), "an array of strings");
  assertEquals(mustBeArrayOfStrings("a"), "an array of strings");
});

Deno.test("mustBeObject() rejects null and arrays", () => {
  assertEquals(mustBeObject({}), null);
  assertEquals(mustBeObject({ a: 1 }), null);
  assertEquals(mustBeObject(null), "an object");
  assertEquals(mustBeObject([]), "an object");
  assertEquals(mustBeObject(new Date()), null);
  assertEquals(mustBeObject("{}"), "an object");
  assertEquals(mustBeObject(1), "an object");
});

Deno.test("mustBeEntryPoints() accepts objects/arrays used by flagsForBuildOptions()", () => {
  assertEquals(mustBeEntryPoints({}), null);
  assertEquals(mustBeEntryPoints([]), null);
  assertEquals(mustBeEntryPoints({ a: 1 }), null);
  assertEquals(mustBeEntryPoints([1, 2]), null);
  assertEquals(mustBeEntryPoints(null), "an array or an object");
  assertEquals(mustBeEntryPoints("string"), "an array or an object");
  assertEquals(mustBeEntryPoints(1), "an array or an object");
});

Deno.test("mustBeObjectOrNull() accepts object and null, rejects arrays", () => {
  assertEquals(mustBeObjectOrNull({}), null);
  assertEquals(mustBeObjectOrNull(null), null);
  assertEquals(mustBeObjectOrNull({ a: 1 }), null);
  assertEquals(mustBeObjectOrNull([]), "an object or null");
  assertEquals(mustBeObjectOrNull("obj"), "an object or null");
  assertEquals(mustBeObjectOrNull(1), "an object or null");
});

Deno.test("mustBeStringOrBoolean() accepts only string/boolean", () => {
  assertEquals(mustBeStringOrBoolean("hello"), null);
  assertEquals(mustBeStringOrBoolean(""), null);
  assertEquals(mustBeStringOrBoolean(true), null);
  assertEquals(mustBeStringOrBoolean(false), null);
  assertEquals(mustBeStringOrBoolean(1), "a string or a boolean");
  assertEquals(mustBeStringOrBoolean(null), "a string or a boolean");
  assertEquals(mustBeStringOrBoolean({}), "a string or a boolean");
});

Deno.test("mustBeStringOrObject() accepts only string/plain-object", () => {
  assertEquals(mustBeStringOrObject("hello"), null);
  assertEquals(mustBeStringOrObject({}), null);
  assertEquals(mustBeStringOrObject({ a: 1 }), null);
  assertEquals(mustBeStringOrObject([]), "a string or an object");
  assertEquals(mustBeStringOrObject(1), "a string or an object");
  assertEquals(mustBeStringOrObject(null), "a string or an object");
});

Deno.test("mustBeStringOrArrayOfStrings() accepts only string/string-array", () => {
  assertEquals(mustBeStringOrArrayOfStrings("hello"), null);
  assertEquals(mustBeStringOrArrayOfStrings([]), null);
  assertEquals(mustBeStringOrArrayOfStrings(["a"]), null);
  assertEquals(mustBeStringOrArrayOfStrings(["a", "b"]), null);
  assertEquals(
    mustBeStringOrArrayOfStrings([1] as unknown),
    "a string or an array of strings",
  );
  assertEquals(
    mustBeStringOrArrayOfStrings([null] as unknown),
    "a string or an array of strings",
  );
  assertEquals(mustBeStringOrArrayOfStrings({}), "a string or an array of strings");
  assertEquals(mustBeStringOrArrayOfStrings(1), "a string or an array of strings");
});

Deno.test("mustBeStringOrUint8Array() accepts only string/Uint8Array", () => {
  assertEquals(mustBeStringOrUint8Array("hello"), null);
  assertEquals(mustBeStringOrUint8Array(new Uint8Array(0)), null);
  assertEquals(mustBeStringOrUint8Array(new Uint8Array([1, 2, 3])), null);
  assertEquals(mustBeStringOrUint8Array(1), "a string or a Uint8Array");
  assertEquals(mustBeStringOrUint8Array(null), "a string or a Uint8Array");
  assertEquals(mustBeStringOrUint8Array({}), "a string or a Uint8Array");
  assertEquals(mustBeStringOrUint8Array([]), "a string or a Uint8Array");
});

Deno.test("mustBeStringOrURL() accepts only string/URL", () => {
  assertEquals(mustBeStringOrURL("http://example.com"), null);
  assertEquals(mustBeStringOrURL(new URL("http://example.com")), null);
  assertEquals(mustBeStringOrURL(1), "a string or a URL");
  assertEquals(mustBeStringOrURL(null), "a string or a URL");
  assertEquals(mustBeStringOrURL({}), "a string or a URL");
  assertEquals(mustBeStringOrURL([]), "a string or a URL");
});

Deno.test("mustBeWebAssemblyModule() accepts WebAssembly.Module and rejects other values", () => {
  assertEquals(mustBeWebAssemblyModule(emptyWasmModule), null);
  assertEquals(mustBeWebAssemblyModule(1), "a WebAssembly.Module");
  assertEquals(mustBeWebAssemblyModule("mod"), "a WebAssembly.Module");
  assertEquals(mustBeWebAssemblyModule(null), "a WebAssembly.Module");
  assertEquals(mustBeWebAssemblyModule({}), "a WebAssembly.Module");
});

Deno.test("canBeAnything() returns null", () => {
  assertEquals(canBeAnything(), null);
});

Deno.test("getFlag() returns undefined for absent keys", () => {
  const keys: Record<string, boolean> = {};
  assertEquals(getFlag({ port: 80 }, keys, "missing", mustBeBoolean), undefined);
  assertEquals(getFlag({ port: 80 }, keys, "host", mustBeString), undefined);
});

Deno.test("getFlag() returns the typed value for present valid keys", () => {
  const keys: Record<string, boolean> = {};
  assertEquals(getFlag({ port: 80 }, keys, "port", mustBeInteger), 80);
  assertEquals(getFlag({ host: "localhost" }, keys, "host", mustBeString), "localhost");
  assertEquals(getFlag({ enabled: true }, keys, "enabled", mustBeBoolean), true);
});

Deno.test("getFlag() throws with the project's error format for invalid values", () => {
  const keys: Record<string, boolean> = {};
  assertThrows(
    () => getFlag({ port: "80" }, keys, "port", mustBeValidPortNumber),
    Error,
    '"port" must be a valid port number',
  );
  assertThrows(
    () => getFlag({ name: 123 }, keys, "name", mustBeString),
    Error,
    '"name" must be a string',
  );
  assertThrows(
    () => getFlag({ fn: "not a function" }, keys, "fn", mustBeFunction),
    Error,
    '"fn" must be a function',
  );
});

Deno.test("checkForInvalidFlags() throws on unknown option keys", () => {
  const keys: Record<string, boolean> = { port: true };
  assertThrows(
    () => checkForInvalidFlags({ port: 80, unknown: 1 }, keys, "build"),
    Error,
    'Invalid option build: "unknown"',
  );
  assertThrows(
    () => checkForInvalidFlags({ badkey: true }, {}, "config"),
    Error,
    'Invalid option config: "badkey"',
  );
});

Deno.test("validateStringValue() includes the quoted key name in its error when provided", () => {
  assertEquals(validateStringValue("hello", "option", "port"), "hello");
  assertEquals(validateStringValue("", "option", "host"), "");

  assertThrows(
    () => validateStringValue(1, "option", "port"),
    Error,
    'Expected value for option "port" to be a string, got number instead',
  );
  assertThrows(
    () => validateStringValue(null, "option", "host"),
    Error,
    'Expected value for option "host" to be a string, got object instead',
  );
});

Deno.test("validateStringValue() omits key name when key is undefined", () => {
  assertEquals(validateStringValue("hello", "option"), "hello");

  assertThrows(
    () => validateStringValue(1, "option"),
    Error,
    "Expected value for option to be a string, got number instead",
  );
});

Deno.test("validateAndJoinStringArray() joins valid arrays and rejects entries containing commas", () => {
  assertEquals(validateAndJoinStringArray(["a", "b"], "paths"), "a,b");
  assertEquals(validateAndJoinStringArray([], "paths"), "");
  assertEquals(validateAndJoinStringArray(["alpha", "beta"], "exclude"), "alpha,beta");

  assertThrows(
    () => validateAndJoinStringArray(["a,b"], "paths"),
    Error,
    "Invalid paths: a,b",
  );
  assertThrows(
    () => validateAndJoinStringArray(["x,y,z"], "exclude"),
    Error,
    "Invalid exclude: x,y,z",
  );
  assertThrows(
    () => validateAndJoinStringArray([1, 2] as unknown as string[], "paths"),
    Error,
    "Expected value for paths to be a string, got number instead",
  );
});

Deno.test("validateInitializeOptions() accepts the allowed initialize shape and rejects unknown keys", () => {
  assertEquals(validateInitializeOptions({}), {
    wasmURL: undefined,
    wasmModule: undefined,
    worker: undefined,
  });

  assertEquals(
    validateInitializeOptions({ wasmURL: "http://example.com/wasm.wasm" }),
    {
      wasmURL: "http://example.com/wasm.wasm",
      wasmModule: undefined,
      worker: undefined,
    },
  );

  assertEquals(
    validateInitializeOptions({ wasmModule: emptyWasmModule }),
    { wasmURL: undefined, wasmModule: emptyWasmModule, worker: undefined },
  );

  assertEquals(
    validateInitializeOptions({ worker: true }),
    { wasmURL: undefined, wasmModule: undefined, worker: true },
  );

  assertEquals(
    validateInitializeOptions({
      wasmURL: "http://x.wasm",
      wasmModule: emptyWasmModule,
      worker: false,
    }),
    { wasmURL: "http://x.wasm", wasmModule: emptyWasmModule, worker: false },
  );

  assertThrows(
    () =>
      validateInitializeOptions(
        { unknownKey: 1 } as unknown as Parameters<typeof validateInitializeOptions>[0],
      ),
    Error,
    'Invalid option in initialize() call: "unknownKey"',
  );

  assertThrows(
    () =>
      validateInitializeOptions(
        { wasmURL: 123 } as unknown as Parameters<typeof validateInitializeOptions>[0],
      ),
    Error,
    '"wasmURL" must be a string or a URL',
  );

  assertThrows(
    () =>
      validateInitializeOptions(
        { wasmModule: "bad" } as unknown as Parameters<
          typeof validateInitializeOptions
        >[0],
      ),
    Error,
    '"wasmModule" must be a WebAssembly.Module',
  );

  assertThrows(
    () =>
      validateInitializeOptions(
        { worker: "true" } as unknown as Parameters<
          typeof validateInitializeOptions
        >[0],
      ),
    Error,
    '"worker" must be a boolean',
  );
});

Deno.test("validateMangleCache() accepts string/false mappings and rejects all other values", () => {
  assertEquals(validateMangleCache(undefined), undefined);
  assertEquals(validateMangleCache({}), {});
  assertEquals(validateMangleCache({ a: "x" }), { a: "x" });
  assertEquals(validateMangleCache({ a: "x", b: false }), { a: "x", b: false });

  const validated = validateMangleCache({ a: "x", b: "y" });
  assertEquals(validated, { a: "x", b: "y" });

  assertThrows(
    () =>
      validateMangleCache(
        { a: 1 } as unknown as Parameters<typeof validateMangleCache>[0],
      ),
    Error,
    'Expected "a" in mangle cache to map to either a string or false',
  );

  assertThrows(
    () =>
      validateMangleCache(
        { a: null } as unknown as Parameters<typeof validateMangleCache>[0],
      ),
    Error,
    'Expected "a" in mangle cache to map to either a string or false',
  );

  assertThrows(
    () =>
      validateMangleCache(
        { a: {} } as unknown as Parameters<typeof validateMangleCache>[0],
      ),
    Error,
    'Expected "a" in mangle cache to map to either a string or false',
  );
});

Deno.test("sanitizeStringArray() returns a copied validated string array", () => {
  const original = ["a", "b", "c"];
  const result = sanitizeStringArray(original, "paths");
  assertEquals(result, ["a", "b", "c"]);
  assertEquals(result, original);
  result[0] = "x";
  assertEquals(original[0], "a");

  assertThrows(
    () => sanitizeStringArray(["a", 1, "b"] as unknown as string[], "paths"),
    Error,
    '"paths" must be an array of strings',
  );

  assertThrows(
    () => sanitizeStringArray([null] as unknown as string[], "exclude"),
    Error,
    '"exclude" must be an array of strings',
  );
});

Deno.test("sanitizeStringMap() returns a copied validated string map", () => {
  const original = { a: "x", b: "y" };
  const result = sanitizeStringMap(original, "env");
  assertEquals(result, { a: "x", b: "y" });
  result.a = "changed";
  assertEquals(original.a, "x");

  assertThrows(
    () => sanitizeStringMap({ a: 1 } as unknown as Record<string, string>, "env"),
    Error,
    'key "a" in object "env" must be a string',
  );

  assertThrows(
    () => sanitizeStringMap({ a: null } as unknown as Record<string, string>, "env"),
    Error,
    'key "a" in object "env" must be a string',
  );
});

Deno.test("jsRegExpToGoRegExp() preserves source and includes flags in (?flags) format", () => {
  assertEquals(jsRegExpToGoRegExp(/abc/), "abc");
  assertEquals(jsRegExpToGoRegExp(/^hello/), "^hello");
  assertEquals(jsRegExpToGoRegExp(/a.b$/), "a.b$");
  assertEquals(jsRegExpToGoRegExp(/test/gi), "(?gi)test");
  assertEquals(jsRegExpToGoRegExp(/^a.b+\$/im), "(?im)^a.b+\\$");
  assertEquals(jsRegExpToGoRegExp(new RegExp("escape\\.regex")), "escape\\.regex");
});
