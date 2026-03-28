import { assertEquals } from "jsr:@std/assert@1.0.19";
import {
  createObjectStash,
  extractCallerV8,
  extractErrorMessageV8,
} from "@ggpwnkthx/esbuild/utils";

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
