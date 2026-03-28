import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.19";
import {
  jsRegExpToGoRegExp,
  sanitizeStringArray,
  sanitizeStringMap,
  validateInitializeOptions,
  validateMangleCache,
} from "@ggpwnkthx/esbuild/utils";

const emptyWasmModule = new WebAssembly.Module(
  new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]),
);

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
