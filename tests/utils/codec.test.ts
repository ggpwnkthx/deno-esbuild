import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.19";
import {
  decodeUTF8,
  encodeUTF8,
  getDecodeUTF8,
  getEncodeUTF8,
  JSON_parse,
  parseJSON,
  throwSyntaxError,
} from "@ggpwnkthx/esbuild/utils";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

Deno.test("throwSyntaxError() reports line and column for a printable invalid character", () => {
  const bytes = enc("1\n2X3");
  let error: SyntaxError | undefined;
  try {
    throwSyntaxError(bytes, 3);
  } catch (e) {
    error = e as SyntaxError;
  }
  assertEquals(error instanceof SyntaxError, true);
  assertEquals(error!.message.includes("position"), true);
  assertEquals(error!.message.includes("line"), true);
  assertEquals(error!.message.includes("column"), true);
});

Deno.test("throwSyntaxError() reports the end-of-input message when index === bytes.length", () => {
  const bytes = enc("true");
  assertThrows(
    () => throwSyntaxError(bytes, bytes.length),
    SyntaxError,
    "Unexpected end of input while parsing JSON",
  );
});

Deno.test("throwSyntaxError() reports Unexpected byte 0x.. for non-printable data", () => {
  const bytes = enc("tru");
  bytes[2] = 0x1f;
  let error: SyntaxError | undefined;
  try {
    throwSyntaxError(bytes, 2);
  } catch (e) {
    error = e as SyntaxError;
  }
  assertEquals(error instanceof SyntaxError, true);
  assertEquals(error!.message.includes("0x1f"), true);
});

Deno.test("JSON_parse() parses true", () => {
  assertEquals(JSON_parse(enc("true")), true);
});

Deno.test("JSON_parse() parses false", () => {
  assertEquals(JSON_parse(enc("false")), false);
});

Deno.test("JSON_parse() parses null", () => {
  assertEquals(JSON_parse(enc("null")), null);
});

Deno.test("JSON_parse() parses integers and decimals that this parser accepts", () => {
  assertEquals(JSON_parse(enc("0")), 0);
  assertEquals(JSON_parse(enc("123")), 123);
  assertEquals(JSON_parse(enc("-456")), -456);
  assertEquals(JSON_parse(enc("1.5")), 1.5);
  assertEquals(JSON_parse(enc("0.25")), 0.25);
  assertEquals(JSON_parse(enc("-0.5")), -0.5);
  assertEquals(JSON_parse(enc("1e3")), 1e3);
  assertEquals(JSON_parse(enc("1E3")), 1e3);
  assertEquals(JSON_parse(enc("1.5e2")), 1.5e2);
  assertEquals(JSON_parse(enc("1e+3")), 1e+3);
  assertEquals(JSON_parse(enc("1e-3")), 1e-3);
});

Deno.test("JSON_parse() parses strings with escape sequences handled by its string parser", () => {
  assertEquals(JSON_parse(enc('"\\\\"')), "\\");
  assertEquals(JSON_parse(enc('"\\/"')), "/");
  assertEquals(JSON_parse(enc('"\\b"')), "\b");
  assertEquals(JSON_parse(enc('"\\f"')), "\f");
  assertEquals(JSON_parse(enc('"\\n"')), "\n");
  assertEquals(JSON_parse(enc('"\\r"')), "\r");
  assertEquals(JSON_parse(enc('"\\t"')), "\t");
  assertEquals(JSON_parse(enc('"\\u0041"')), "A");
});

Deno.test("JSON_parse() parses arrays", () => {
  assertEquals(JSON_parse(enc("[1,2,3]")), [1, 2, 3]);
  assertEquals(JSON_parse(enc("[]")), []);
  assertEquals(JSON_parse(enc("[true,false,null]")), [true, false, null]);
});

Deno.test("JSON_parse() parses objects", () => {
  assertEquals(JSON_parse(enc('{"a":1}')), { a: 1 });
  assertEquals(JSON_parse(enc("{}")), {});
  assertEquals(JSON_parse(enc('{"x":true,"y":null}')), { x: true, y: null });
});

Deno.test("JSON_parse() parses nested arrays and objects", () => {
  assertEquals(JSON_parse(enc("[[1,2],[3,4]]")), [[1, 2], [3, 4]]);
  assertEquals(JSON_parse(enc('{"arr":[1,2]}')), { arr: [1, 2] });
  assertEquals(JSON_parse(enc('{"obj":{"n":42}}')), { obj: { n: 42 } });
  assertEquals(JSON_parse(enc('[[{"a":1}]]')), [[{ a: 1 }]]);
});

Deno.test("JSON_parse() parses UTF-8 multibyte characters in strings", () => {
  assertEquals(JSON_parse(enc('"é"')), "é");
  assertEquals(JSON_parse(enc('"日本"')), "日本");
  assertEquals(JSON_parse(enc('"😀"')), "😀");
});

Deno.test("JSON_parse() rejects malformed literals", () => {
  assertThrows(() => JSON_parse(enc("tru")), SyntaxError);
  assertThrows(() => JSON_parse(enc("falze")), SyntaxError);
  assertThrows(() => JSON_parse(enc("nul")), SyntaxError);
  assertThrows(() => JSON_parse(enc("nulll")), SyntaxError);
});

Deno.test("JSON_parse() rejects malformed numbers that hit its number-validation branch", () => {
  assertThrows(() => JSON_parse(enc(".")), SyntaxError, "Invalid number");
  assertThrows(() => JSON_parse(enc("1e")), SyntaxError, "Invalid number");
  assertThrows(() => JSON_parse(enc("1e+")), SyntaxError, "Invalid number");
});

Deno.test("JSON_parse() rejects invalid object syntax", () => {
  assertThrows(() => JSON_parse(enc('{"a" 1}')), SyntaxError);
  assertThrows(() => JSON_parse(enc('{"a":1 "b":2}')), SyntaxError);
  assertThrows(() => JSON_parse(enc("{a:1}")), SyntaxError);
});

Deno.test("JSON_parse() rejects invalid array syntax", () => {
  assertThrows(() => JSON_parse(enc("[1 2]")), SyntaxError);
  assertThrows(() => JSON_parse(enc("[1}")), SyntaxError);
  assertThrows(() => JSON_parse(enc("[[1]")), SyntaxError);
});

Deno.test("JSON_parse() throws if called with a non-Uint8Array input", () => {
  assertThrows(
    () => JSON_parse("true" as unknown as Uint8Array),
    Error,
    "JSON input must be a Uint8Array",
  );
  assertThrows(
    () => JSON_parse(new ArrayBuffer(4) as unknown as Uint8Array),
    Error,
    "JSON input must be a Uint8Array",
  );
  assertThrows(
    () => JSON_parse([116, 114, 117, 101] as unknown as Uint8Array),
    Error,
    "JSON input must be a Uint8Array",
  );
});

Deno.test("parseJSON() parses valid UTF-8 JSON via the normal decode path", () => {
  assertEquals(parseJSON(encodeUTF8('{"a":1}')), { a: 1 });
});

Deno.test("getEncodeUTF8() returns a function that encodes to Uint8Array", () => {
  const encode = getEncodeUTF8();
  assertEquals(typeof encode, "function");
  const result = encode("hello");
  assertEquals(result instanceof Uint8Array, true);
});

Deno.test("getDecodeUTF8() returns a function that decodes from Uint8Array", () => {
  const decode = getDecodeUTF8();
  assertEquals(typeof decode, "function");
  assertEquals(decode(new Uint8Array([104, 101, 108, 108, 111])), "hello");
});

Deno.test("encodeUTF8() + decodeUTF8() round-trip Unicode text used by this project's packet/JSON code", () => {
  assertEquals(decodeUTF8(encodeUTF8("hello")), "hello");
  assertEquals(decodeUTF8(encodeUTF8("日本")), "日本");
  assertEquals(decodeUTF8(encodeUTF8("😀🙂")), "😀🙂");
});
