import {
  assert,
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "@std/assert";

Deno.test("mod.ts declares the documented async + sync API surface", async () => {
  const modText = await Deno.readTextFile(
    new URL("../mod.ts", import.meta.url),
  );

  const expected = [
    "export const build",
    "export const context",
    "export const transform",
    "export const formatMessages",
    "export const analyzeMetafile",
    "export const stop",
    "export const initialize",
    "export const version",
    "export const buildSync",
    "export const transformSync",
    "export const formatMessagesSync",
    "export const analyzeMetafileSync",
  ];

  for (const needle of expected) {
    assertStringIncludes(modText, needle, `mod.ts must declare ${needle}`);
  }
});

Deno.test("wasm.ts re-exports version from mod.ts", async () => {
  const wasmText = await Deno.readTextFile(
    new URL("../wasm.ts", import.meta.url),
  );
  assertStringIncludes(
    wasmText,
    'import { version } from "./mod.ts";',
    "wasm.ts must import version from mod.ts",
  );
  assertStringIncludes(
    wasmText,
    "export { version }",
    "wasm.ts must re-export version",
  );
});

Deno.test("deno.json exports map covers all public submodules", async () => {
  const denoJsonText = await Deno.readTextFile(
    new URL("../deno.json", import.meta.url),
  );
  const denoJson = JSON.parse(denoJsonText) as {
    exports: Record<string, string>;
  };

  const expectedKeys = [
    ".",
    "./wasm",
    "./shared/common",
    "./shared/stdio_protocol",
    "./shared/types",
    "./shared/uint8array_json_parser",
    "./shared/worker",
  ];

  for (const key of expectedKeys) {
    assert(
      Object.prototype.hasOwnProperty.call(denoJson.exports, key),
      `deno.json exports must include key ${key}`,
    );
    const value = denoJson.exports[key];
    assert(
      typeof value === "string" && value.length > 0,
      `deno.json exports[${key}] must be a non-empty string`,
    );
  }
});

Deno.test("deno.json test task is deno test -A", async () => {
  const denoJsonText = await Deno.readTextFile(
    new URL("../deno.json", import.meta.url),
  );
  const denoJson = JSON.parse(denoJsonText) as {
    tasks: Record<string, string>;
  };
  assertEquals(denoJson.tasks.test, "deno test -A");
});

Deno.test("deno.json package name and version are present and non-empty", async () => {
  const denoJsonText = await Deno.readTextFile(
    new URL("../deno.json", import.meta.url),
  );
  const denoJson = JSON.parse(denoJsonText) as {
    name: string;
    version: string;
  };
  assertEquals(denoJson.name, "@ggpwnkthx/esbuild");
  assertMatch(denoJson.version, /^\d+\.\d+\.\d+/);
});
