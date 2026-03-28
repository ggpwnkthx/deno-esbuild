import { assertEquals } from "jsr:@std/assert@1.0.19";
import {
  mustBeBoolean,
  mustBeFunction,
  mustBeInteger,
  mustBeRegExp,
  mustBeString,
  mustBeValidPortNumber,
} from "@ggpwnkthx/esbuild/utils";

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
