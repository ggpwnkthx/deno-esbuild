import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.19";
import {
  convertOutputFiles,
  createObjectStash,
  encodeUTF8,
  extractCallerV8,
  extractErrorMessageV8,
  failureErrorWithLog,
  replaceDetailsInMessages,
  sanitizeLocation,
  sanitizeMessages,
} from "@ggpwnkthx/esbuild/utils";
import { Message } from "@ggpwnkthx/esbuild";

Deno.test("createObjectStash().store() and .load() round-trip an arbitrary detail object", () => {
  const stash = createObjectStash();
  const obj = { a: 1, b: "test", c: [1, 2, 3] };
  const id = stash.store(obj);
  assertEquals(id, 0);
  assertEquals(stash.load(id), obj);
});

Deno.test("createObjectStash().store() and .load() round-trip multiple values", () => {
  const stash = createObjectStash();
  const id1 = stash.store({ type: "first" });
  const id2 = stash.store({ type: "second" });
  const id3 = stash.store("just a string");
  assertEquals(id1, 0);
  assertEquals(id2, 1);
  assertEquals(id3, 2);
  assertEquals(stash.load(id1), { type: "first" });
  assertEquals(stash.load(id2), { type: "second" });
  assertEquals(stash.load(id3), "just a string");
});

Deno.test("createObjectStash().store(undefined) returns -1", () => {
  const stash = createObjectStash();
  assertEquals(stash.store(undefined), -1);
  assertEquals(stash.store(void 0), -1);
});

Deno.test("createObjectStash().clear() removes stored values", () => {
  const stash = createObjectStash();
  stash.store({ a: 1 });
  stash.store({ b: 2 });
  assertEquals(stash.load(0), { a: 1 });
  assertEquals(stash.load(1), { b: 2 });
  stash.clear();
  assertEquals(stash.load(0), undefined);
  assertEquals(stash.load(1), undefined);
});

Deno.test("extractErrorMessageV8() returns Message with fallback text and location: null when stack parsing fails", () => {
  const stash = createObjectStash();
  const e = new Error("something went wrong");
  e.stack = "Error: something went wrong\n    at Context.<anonymous> (test.js:10:15)";
  const streamIn = { readFileSync: undefined };
  const result = extractErrorMessageV8(e, streamIn, stash, "myPlugin");
  assertEquals(result.text, "something went wrong");
  assertEquals(result.pluginName, "myPlugin");
  assertEquals(result.location, null);
  assertEquals(result.id, "");
  assertEquals(result.notes, []);
  assertEquals(result.detail, -1);
});

Deno.test("extractErrorMessageV8() uses error message when available", () => {
  const stash = createObjectStash();
  const e = { message: "custom error message" };
  const streamIn = {};
  const result = extractErrorMessageV8(e, streamIn, stash, "testPlugin");
  assertEquals(result.text, "custom error message");
  assertEquals(result.pluginName, "testPlugin");
});

Deno.test("extractErrorMessageV8() returns fallback text when error has no message", () => {
  const stash = createObjectStash();
  const e = { toString: () => "fallback error" };
  const streamIn = {};
  const result = extractErrorMessageV8(e, streamIn, stash, "plugin");
  assertEquals(result.text, "fallback error");
});

Deno.test("extractCallerV8() returns undefined when stack lines do not match V8 parser", () => {
  const e = new Error("test");
  e.stack = "Error: test\n  at Function XYZ (unknown format)";
  const streamIn = {};
  const getCaller = extractCallerV8(e, streamIn, "ident");
  assertEquals(getCaller(), undefined);
});

Deno.test("extractCallerV8() returns note with file/line/column when given parsable V8 stack and readFileSync", () => {
  const e = new Error("test error");
  e.stack =
    "Error: test error\n    at Function.a (/project/src/a.ts:10:5)\n    at myFunction (/project/src/index.ts:5:10)";
  let callCount = 0;
  const streamIn = {
    readFileSync: (_path: string, _encoding: string) => {
      callCount++;
      return `line 1\nline 2\nline 3\nline 4\nconsole.log("test");\nline 6\n`;
    },
  };
  const getCaller = extractCallerV8(e, streamIn, "console");
  const result = getCaller();
  assertEquals(callCount, 1);
  assertEquals(result!.text, "test error");
  assertEquals(result!.location.file, "/project/src/index.ts");
  assertEquals(result!.location.line, 5);
  assertEquals(result!.location.namespace, "file");
});

Deno.test("extractCallerV8() memoizes its computed result", () => {
  const e = new Error("memoize test");
  e.stack =
    "Error: memoize test\n    at Function.a (/project/src/a.ts:5:1)\n    at testFunc (/project/src/app.ts:3:5)";
  let readCount = 0;
  const streamIn = {
    readFileSync: (_path: string, _encoding: string) => {
      readCount++;
      return "line1\nline2\nline3\nline4\n";
    },
  };
  const getCaller = extractCallerV8(e, streamIn, "test");
  const result1 = getCaller();
  const result2 = getCaller();
  assertEquals(readCount, 1);
  assertEquals(result1, result2);
});

Deno.test("failureErrorWithLog() creates an Error whose message includes error count and formatted entries", () => {
  const errors: Message[] = [
    {
      id: "1",
      pluginName: "",
      text: "error one",
      location: {
        file: "a.ts",
        namespace: "file",
        line: 1,
        column: 2,
        length: 0,
        lineText: "",
        suggestion: "",
      },
      notes: [],
      detail: -1,
    },
    {
      id: "2",
      pluginName: "",
      text: "error two",
      location: {
        file: "b.ts",
        namespace: "file",
        line: 5,
        column: 10,
        length: 0,
        lineText: "",
        suggestion: "",
      },
      notes: [],
      detail: -1,
    },
  ];
  const warnings: Message[] = [];
  const error = failureErrorWithLog("Build failed", errors, warnings);
  assertEquals(error.message.includes("Build failed with 2 errors:"), true);
  assertEquals(error.message.includes("a.ts:1:2: ERROR:"), true);
  assertEquals(error.message.includes("b.ts:5:10: ERROR:"), true);
  assertEquals(error.message.includes("error one"), true);
  assertEquals(error.message.includes("error two"), true);
});

Deno.test("failureErrorWithLog() includes [plugin: name] when pluginName is present", () => {
  const errors: Message[] = [
    {
      id: "1",
      pluginName: "myPlugin",
      text: "plugin error",
      location: {
        file: "x.ts",
        namespace: "file",
        line: 1,
        column: 1,
        length: 0,
        lineText: "",
        suggestion: "",
      },
      notes: [],
      detail: -1,
    },
  ];
  const warnings: Message[] = [];
  const error = failureErrorWithLog("Failed", errors, warnings);
  assertEquals(error.message.includes("[plugin: myPlugin]"), true);
  assertEquals(error.message.includes("plugin error"), true);
});

Deno.test("failureErrorWithLog() exposes .errors and .warnings properties", () => {
  const errors: Message[] = [
    { id: "e1", pluginName: "", text: "err", location: null, notes: [], detail: -1 },
  ];
  const warnings: Message[] = [
    { id: "w1", pluginName: "", text: "warn", location: null, notes: [], detail: -1 },
  ];
  const error = failureErrorWithLog("done", errors, warnings);
  assertEquals(error.errors, errors);
  assertEquals(error.warnings, warnings);
});

Deno.test("failureErrorWithLog() truncates displayed errors after 5 entries with ...", () => {
  const errors: Message[] = Array.from({ length: 6 }, (_, i) => ({
    id: String(i),
    pluginName: "",
    text: `error ${i}`,
    location: {
      file: `f${i}.ts`,
      namespace: "file",
      line: i + 1,
      column: 0,
      length: 0,
      lineText: "",
      suggestion: "",
    },
    notes: [],
    detail: -1,
  }));
  const warnings: Message[] = [];
  const error = failureErrorWithLog("Failed", errors, warnings);
  assertEquals(error.message.includes("..."), true);
  assertEquals(error.message.includes("with 6 error"), true);
});

Deno.test("failureErrorWithLog() formats error without location correctly", () => {
  const errors: Message[] = [
    {
      id: "1",
      pluginName: "",
      text: "missing location error",
      location: null,
      notes: [],
      detail: -1,
    },
  ];
  const warnings: Message[] = [];
  const error = failureErrorWithLog("Failed", errors, warnings);
  assertEquals(error.message.includes("error: missing location error"), true);
});

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

Deno.test("replaceDetailsInMessages() restores stashed detail values", () => {
  const stash = createObjectStash();
  const detail1 = { info: "first" };
  const detail2 = { info: "second" };
  const id1 = stash.store(detail1);
  const id2 = stash.store(detail2);
  const messages: Message[] = [
    { id: "1", pluginName: "", text: "err1", location: null, notes: [], detail: id1 },
    { id: "2", pluginName: "", text: "err2", location: null, notes: [], detail: id2 },
  ];
  const result = replaceDetailsInMessages(messages, stash);
  assertEquals(result[0].detail, detail1);
  assertEquals(result[1].detail, detail2);
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
