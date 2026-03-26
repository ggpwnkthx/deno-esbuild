import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1.0.19";
import {
  analyzeMetafile,
  analyzeMetafileSync,
  build,
  buildSync,
  context,
  formatMessages,
  formatMessagesSync,
  initialize,
  stop,
  transform,
  transformSync,
} from "@ggpwnkthx/esbuild";
import { getModVersion } from "@ggpwnkthx/esbuild/install";

const testBinPath = Deno.env.get("ESBUILD_BINARY_PATH");

async function resetState(): Promise<void> {
  await stop();
}

Deno.test("buildSync() throws in Deno", () => {
  assertThrows(
    () => buildSync(),
    Error,
    'The "buildSync" API does not work in Deno',
  );
});

Deno.test("transformSync() throws in Deno", () => {
  assertThrows(
    () => transformSync(),
    Error,
    'The "transformSync" API does not work in Deno',
  );
});

Deno.test("formatMessagesSync() throws in Deno", () => {
  assertThrows(
    () => formatMessagesSync(),
    Error,
    'The "formatMessagesSync" API does not work in Deno',
  );
});

Deno.test("analyzeMetafileSync() throws in Deno", () => {
  assertThrows(
    () => analyzeMetafileSync(),
    Error,
    'The "analyzeMetafileSync" API does not work in Deno',
  );
});

Deno.test("initialize() rejects wasmURL", async () => {
  await resetState();
  await assertRejects(
    async () => {
      await initialize({ wasmURL: "https://example.com/esbuild.wasm" });
    },
    Error,
    'The "wasmURL" option only works in the browser',
  );
});

Deno.test("initialize() rejects wasmModule", async () => {
  await resetState();
  await assertRejects(
    async () => {
      await initialize({
        wasmModule: new WebAssembly.Module(
          new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]),
        ),
      });
    },
    Error,
    'The "wasmModule" option only works in the browser',
  );
});

Deno.test("initialize() rejects worker", async () => {
  await resetState();
  await assertRejects(
    async () => {
      await initialize({ worker: true });
    },
    Error,
    'The "worker" option only works in the browser',
  );
});

Deno.test("initialize() rejects being called more than once", async () => {
  await resetState();
  try {
    if (!testBinPath) return;
    await initialize({});
    await assertRejects(
      async () => {
        await initialize({});
      },
      Error,
      'Cannot call "initialize" more than once',
    );
  } finally {
    await resetState();
  }
});

Deno.test("initialize() and build() work together", async () => {
  await resetState();
  try {
    if (!testBinPath) return;
    await initialize({});
    const result = await build({ entryPoints: [] });
    assertEquals(result.errors, []);
  } finally {
    await resetState();
  }
});

Deno.test("stop() is a no-op when service has not been started", async () => {
  await resetState();
  await stop();
});

Deno.test("build() returns BuildResult with errors array", async () => {
  await resetState();
  try {
    if (!testBinPath) return;
    const result = await build({ entryPoints: [] });
    assertEquals(Array.isArray(result.errors), true);
  } finally {
    await resetState();
  }
});

Deno.test("context() returns BuildContext with required methods", async () => {
  await resetState();
  try {
    if (!testBinPath) return;
    const ctx = await context({ entryPoints: [] });
    assertEquals(typeof ctx.rebuild, "function");
    assertEquals(typeof ctx.watch, "function");
    assertEquals(typeof ctx.serve, "function");
    assertEquals(typeof ctx.cancel, "function");
    assertEquals(typeof ctx.dispose, "function");
    await ctx.dispose();
  } finally {
    await resetState();
  }
});

Deno.test("transform() returns TransformResult with code string", async () => {
  await resetState();
  try {
    if (!testBinPath) return;
    const result = await transform("const x: number = 1;", { loader: "ts" });
    assertEquals(Array.isArray(result.warnings), true);
    assertEquals(typeof result.code, "string");
  } finally {
    await resetState();
  }
});

Deno.test("formatMessages() returns string array", async () => {
  await resetState();
  try {
    if (!testBinPath) return;
    const messages = [
      { text: "test error", location: { file: "test.ts", line: 1, column: 1 } },
    ];
    const formatted = await formatMessages(messages, { kind: "error" });
    assertEquals(Array.isArray(formatted), true);
    assertEquals(formatted.length >= 1, true);
  } finally {
    await resetState();
  }
});

Deno.test("analyzeMetafile() stringifies object metafiles", async () => {
  await resetState();
  try {
    if (!testBinPath) return;
    const metafile = {
      inputs: {
        "test.ts": {
          bytes: 10,
          imports: [],
        },
      },
      outputs: {
        "out.js": {
          bytes: 10,
          inputs: {},
          imports: [],
          exports: [],
        },
      },
    };
    const result = await analyzeMetafile(metafile);
    assertEquals(typeof result, "string");
    assertEquals(result.includes("test.ts"), true);
  } finally {
    await resetState();
  }
});

Deno.test("version export matches getModVersion", async () => {
  await resetState();
  const api = await import("@ggpwnkthx/esbuild");
  const expectedVersion = await getModVersion();
  assertEquals(api.version(), expectedVersion);
});
