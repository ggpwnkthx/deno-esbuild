import { assertEquals } from "jsr:@std/assert@1.0.19";
import {
  mustBeArray,
  mustBeArrayOfStrings,
  mustBeEntryPoints,
  mustBeObject,
  mustBeObjectOrNull,
  mustBeStringOrArrayOfStrings,
  mustBeStringOrBoolean,
  mustBeStringOrObject,
  mustBeStringOrUint8Array,
  mustBeStringOrURL,
  mustBeWebAssemblyModule,
} from "@ggpwnkthx/esbuild/utils";

const emptyWasmModule = new WebAssembly.Module(
  new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]),
);

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
