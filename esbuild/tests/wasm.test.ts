import { assert, assertEquals, assertStringIncludes } from "@std/assert";

Deno.test("bundled esbuild.wasm is a valid WebAssembly module", async () => {
  const bytes = await Deno.readFile(
    new URL("../bin/js/wasm/esbuild.wasm", import.meta.url),
  );
  assert(bytes.byteLength > 0, "wasm file is not empty");
  const module = await WebAssembly.compile(bytes);
  const imports = WebAssembly.Module.imports(module);
  assert(
    imports.length > 0,
    `expected WebAssembly module to declare imports; got ${imports.length}`,
  );
});

Deno.test("wasm_exec.js is non-empty JavaScript that defines a Go runtime", async () => {
  const text = await Deno.readTextFile(
    new URL("../wasm_exec.js", import.meta.url),
  );
  assert(
    text.length > 1000,
    `wasm_exec.js is suspiciously small: ${text.length}`,
  );
  // The upstream Go runtime ships as `Go = class { ... }` (or prefixed with
  // `globalThis.Go = class { ... }`). Either form satisfies the contract.
  assert(
    /Go\s*=\s*class/.test(text),
    "wasm_exec.js should define the Go runtime as `Go = class`",
  );
});

Deno.test({
  name: "wasm.initialize() + transform() works end-to-end",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const wasm = await import("../wasm.ts");
    try {
      await wasm.initialize({});
      const result = await wasm.transform("const x: number = 1", {
        loader: "ts",
      });
      assertStringIncludes(result.code, "const x = 1");
      assertEquals(result.code.includes(": number"), false);
    } finally {
      await wasm.stop();
    }
  },
});

Deno.test({
  name: "initialize() with invalid wasmURL rejects",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const wasm = await import("../wasm.ts");
    await assertRejects(
      () => wasm.initialize({ wasmURL: "https://example.invalid/x.wasm" }),
      Error,
    );
  },
});

async function assertRejects(
  fn: () => Promise<unknown>,
  ErrorCtor: typeof Error,
): Promise<void> {
  let thrown: unknown;
  try {
    await fn();
  } catch (e) {
    thrown = e;
  }
  if (thrown === undefined) {
    throw new Error("expected promise to reject, but it resolved");
  }
  if (!(thrown instanceof ErrorCtor)) {
    throw new Error(
      `expected error of type ${ErrorCtor.name}, got ${
        Object.prototype.toString.call(thrown)
      }`,
    );
  }
}
