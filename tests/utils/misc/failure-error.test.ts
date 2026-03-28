import { assertEquals } from "jsr:@std/assert@1.0.19";
import { failureErrorWithLog } from "@ggpwnkthx/esbuild/utils";
import type { Message } from "@ggpwnkthx/esbuild";

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
