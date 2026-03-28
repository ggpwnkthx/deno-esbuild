import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.19";
import {
  convertOutputFiles,
  createObjectStash,
  encodeUTF8,
  sanitizeLocation,
  sanitizeMessages,
} from "@ggpwnkthx/esbuild/utils";

Deno.test("sanitizeLocation() returns null when input is null", () => {
  const result = sanitizeLocation(null, "test", undefined);
  assertEquals(result, null);
});

Deno.test("sanitizeLocation() returns null when input is undefined", () => {
  const result = sanitizeLocation(undefined, "test", undefined);
  assertEquals(result, null);
});

Deno.test("sanitizeLocation() fills default values for omitted location fields", () => {
  const input = { line: 42 };
  const result = sanitizeLocation(input, "test", undefined);
  assertEquals(result!.file, "");
  assertEquals(result!.namespace, "");
  assertEquals(result!.line, 42);
  assertEquals(result!.column, 0);
  assertEquals(result!.length, 0);
  assertEquals(result!.lineText, "");
  assertEquals(result!.suggestion, "");
});

Deno.test("sanitizeLocation() preserves provided location fields", () => {
  const input = {
    file: "/project/src/index.ts",
    namespace: "file",
    line: 10,
    column: 5,
    length: 20,
    lineText: "const x = 1;",
    suggestion: "add semicolon",
  };
  const result = sanitizeLocation(input, "test", undefined);
  assertEquals(result, input);
});

Deno.test("sanitizeLocation() throws on unknown fields", () => {
  const input = { file: "a.ts", unknownField: true };
  assertThrows(
    () => sanitizeLocation(input, "test", undefined),
    Error,
    'Invalid option test: "unknownField"',
  );
});

Deno.test("sanitizeMessages() normalizes partial messages into full Message objects", () => {
  const partialMessages = [
    { text: "first error", location: { file: "a.ts", line: 1, column: 0 } },
    { text: "second error", pluginName: "myPlugin" },
  ];
  const stash = createObjectStash();
  const result = sanitizeMessages(
    partialMessages,
    "errors",
    stash,
    "defaultPlugin",
    undefined,
  );
  assertEquals(result.length, 2);
  assertEquals(result[0].id, "");
  assertEquals(result[0].pluginName, "defaultPlugin");
  assertEquals(result[0].text, "first error");
  assertEquals(result[0].location!.file, "a.ts");
  assertEquals(result[1].pluginName, "myPlugin");
  assertEquals(result[1].text, "second error");
});

Deno.test("sanitizeMessages() applies fallbackPluginName when pluginName is missing", () => {
  const partialMessages = [{ text: "error without plugin" }];
  const stash = createObjectStash();
  const result = sanitizeMessages(
    partialMessages,
    "errors",
    stash,
    "fallbackName",
    undefined,
  );
  assertEquals(result[0].pluginName, "fallbackName");
});

Deno.test("sanitizeMessages() sanitizes nested notes", () => {
  const partialMessages = [
    {
      text: "main error",
      notes: [
        { text: "note one", location: { file: "a.ts", line: 1, column: 0 } },
        { text: "note two" },
      ],
    },
  ];
  const stash = createObjectStash();
  const result = sanitizeMessages(
    partialMessages,
    "errors",
    stash,
    "plugin",
    undefined,
  );
  assertEquals(result[0].notes.length, 2);
  assertEquals(result[0].notes[0].text, "note one");
  assertEquals(result[0].notes[0].location!.file, "a.ts");
  assertEquals(result[0].notes[1].text, "note two");
  assertEquals(result[0].notes[1].location, null);
});

Deno.test("sanitizeMessages() stores detail in the stash when a stash is provided", () => {
  const detailObj = { extra: "info" };
  const partialMessages = [{ text: "error", detail: detailObj }];
  const stash = createObjectStash();
  const result = sanitizeMessages(
    partialMessages,
    "errors",
    stash,
    "plugin",
    undefined,
  );
  assertEquals(result[0].detail, 0);
  assertEquals(stash.load(0), detailObj);
});

Deno.test("sanitizeMessages() sets detail to -1 when no stash is provided", () => {
  const partialMessages = [{ text: "error", detail: { some: "data" } }];
  const result = sanitizeMessages(partialMessages, "errors", null, "plugin", undefined);
  assertEquals(result[0].detail, -1);
});

Deno.test("convertOutputFiles() returns an object with lazy .text decoding", () => {
  const contents = encodeUTF8("hello world");
  const file = { path: "/dist/bundle.js", contents, hash: "abc123" };
  const result = convertOutputFiles(file);
  assertEquals(result.path, "/dist/bundle.js");
  assertEquals(result.hash, "abc123");
  assertEquals(result.contents, contents);
  assertEquals(result.text, "hello world");
  assertEquals(typeof result.text, "string");
});

Deno.test("convertOutputFiles().text returns cached text on subsequent access without file changes", () => {
  const contents = encodeUTF8("hello world");
  const file = { path: "/dist/bundle.js", contents, hash: "abc123" };
  const result = convertOutputFiles(file);
  assertEquals(result.text, "hello world");
  assertEquals(result.text, "hello world");
});
