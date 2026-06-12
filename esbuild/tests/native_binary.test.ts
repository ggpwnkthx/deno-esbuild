import { assertEquals, assertMatch, assertStringIncludes } from "@std/assert";

Deno.test({
  name: "bundled linux-x64 binary runs and reports its version",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    if (Deno.build.os !== "linux") return;
    if (Deno.build.arch !== "x86_64") return;

    const binary = new URL("../bin/linux/x64/esbuild", import.meta.url);
    const cmd = new Deno.Command(binary, {
      args: ["--version"],
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stdout, stderr } = await cmd.output();

    assertEquals(
      code,
      0,
      `esbuild --version exited non-zero; stderr=${
        new TextDecoder().decode(stderr)
      }`,
    );
    const out = new TextDecoder().decode(stdout);
    assertMatch(out, /^\d+\.\d+\.\d+\n?$/);
  },
});

Deno.test({
  name: "esbuild.transform() of a TypeScript string strips the type annotation",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const esbuild = await import("../mod.ts");
    try {
      const result = await esbuild.transform(
        "export const x: number = 1;",
        { loader: "ts" },
      );
      assertStringIncludes(result.code, "export const x = 1");
      assertEquals(result.code.includes(": number"), false);
    } finally {
      await esbuild.stop();
    }
  },
});

Deno.test({
  name: "esbuild.build() with write:false returns in-memory outputFiles",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const esbuild = await import("../mod.ts");
    const tmpDir = await Deno.makeTempDir();
    try {
      const entry = `${tmpDir}/entry.ts`;
      await Deno.writeTextFile(entry, "export const v = 1;\n");
      const result = await esbuild.build({
        entryPoints: [entry],
        write: false,
        bundle: true,
        format: "esm",
      });
      assertEquals(result.outputFiles.length > 0, true);
      // esbuild's bundler rewrites the entry into `var v = 1; export { v };`,
      // so assert the value and the export marker separately rather than the
      // verbatim source.
      assertStringIncludes(result.outputFiles[0].text, "v = 1");
      assertStringIncludes(result.outputFiles[0].text, "export");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
      await esbuild.stop();
    }
  },
});

Deno.test({
  name: "esbuild.build() with write:true writes to disk",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const esbuild = await import("../mod.ts");
    const tmpDir = await Deno.makeTempDir();
    try {
      const entry = `${tmpDir}/entry.ts`;
      const outfile = `${tmpDir}/out.js`;
      await Deno.writeTextFile(entry, "export const v = 1;\n");
      await esbuild.build({
        entryPoints: [entry],
        write: true,
        outfile,
        bundle: true,
      });
      const stat = await Deno.stat(outfile);
      assertEquals(stat.isFile, true);
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
      await esbuild.stop();
    }
  },
});

Deno.test({
  name: "esbuild.formatMessages() round-trips a diagnostics array",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const esbuild = await import("../mod.ts");
    try {
      const messages = [
        {
          text: "Something went wrong",
          location: {
            file: "src/index.ts",
            line: 1,
            column: 0,
            lineText: "boom",
            length: 4,
          },
        },
      ];
      const formatted = await esbuild.formatMessages(messages, {
        kind: "error",
      });
      assertEquals(formatted.length, 1);
      assertStringIncludes(formatted[0], "src/index.ts");
    } finally {
      await esbuild.stop();
    }
  },
});

Deno.test({
  name: "esbuild.analyzeMetafile() returns a non-empty string",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const esbuild = await import("../mod.ts");
    const tmpDir = await Deno.makeTempDir();
    try {
      const entry = `${tmpDir}/entry.ts`;
      await Deno.writeTextFile(entry, "console.log(1);\n");
      const result = await esbuild.build({
        entryPoints: [entry],
        outfile: `${tmpDir}/out.js`,
        write: false,
        metafile: true,
      });
      const text = await esbuild.analyzeMetafile(
        result.metafile as unknown as string,
      );
      assertEquals(typeof text, "string");
      assertEquals(text.length > 0, true);
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
      await esbuild.stop();
    }
  },
});

Deno.test({
  name: "esbuild.context().rebuild() works and dispose() cleans up",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const esbuild = await import("../mod.ts");
    const tmpDir = await Deno.makeTempDir();
    try {
      const entry = `${tmpDir}/entry.ts`;
      await Deno.writeTextFile(entry, "export const v = 1;\n");
      const ctx = await esbuild.context({
        entryPoints: [entry],
        outfile: `${tmpDir}/out.js`,
        write: false,
      });
      const r1 = await ctx.rebuild();
      assertEquals(typeof r1, "object");
      await ctx.dispose();
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
      await esbuild.stop();
    }
  },
});

Deno.test({
  name: "stop() is safe to call twice",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const esbuild = await import("../mod.ts");
    // First call should not throw.
    await esbuild.stop();
    // Second call should also not throw.
    await esbuild.stop();
  },
});

Deno.test({
  name: "ESBUILD_BINARY_PATH override skips the cache + sha256 step",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    // Pick a real native binary that exists in this package as the override.
    const overrideBinary = new URL(
      "../bin/linux/x64/esbuild",
      import.meta.url,
    );
    // mod.ts passes the value of this env var straight to Deno.Command, which
    // expects a filesystem path, not a `file://` URL. Convert via realPath.
    Deno.env.set("ESBUILD_BINARY_PATH", Deno.realPathSync(overrideBinary));
    try {
      const esbuild = await import("../mod.ts?override=1");
      try {
        const result = await esbuild.transform("const x = 1", {
          loader: "ts",
        });
        assertStringIncludes(result.code, "const x = 1");
      } finally {
        await esbuild.stop();
      }
    } finally {
      Deno.env.delete("ESBUILD_BINARY_PATH");
    }
  },
});

Deno.test({
  name: "initialize() with wasmURL throws in native mode",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const esbuild = await import("../mod.ts");
    await assertRejects(
      () => esbuild.initialize({ wasmURL: "https://example.invalid/x.wasm" }),
      Error,
      "wasmURL",
    );
  },
});

Deno.test({
  name: "initialize() with wasmModule throws in native mode",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const esbuild = await import("../mod.ts");
    // Minimal valid WebAssembly module: the 4-byte magic number `0x00 0x61
    // 0x73 0x6d` ("\0asm") followed by the 4-byte version `0x01 0x00 0x00
    // 0x00`. Compile must succeed so that the test exercises esbuild's
    // `validateInitializeOptions` rejection, not WebAssembly validation.
    const dummy = new Uint8Array([
      0x00,
      0x61,
      0x73,
      0x6d,
      0x01,
      0x00,
      0x00,
      0x00,
    ]);
    const mod = await WebAssembly.compile(dummy);
    await assertRejects(
      () => esbuild.initialize({ wasmModule: mod }),
      Error,
      "wasmModule",
    );
  },
});

Deno.test({
  name: "initialize() with worker:true throws in native mode",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const esbuild = await import("../mod.ts");
    await assertRejects(
      () => esbuild.initialize({ worker: true }),
      Error,
      "worker",
    );
  },
});

Deno.test({
  name: "initialize() called twice throws",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const esbuild = await import("../mod.ts");
    await esbuild.initialize({});
    await assertRejects(
      () => esbuild.initialize({}),
      Error,
      "initialize",
    );
    await esbuild.stop();
  },
});

async function assertRejects(
  fn: () => Promise<unknown>,
  ErrorCtor: typeof Error,
  messageIncludes: string,
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
  if (!thrown.message.includes(messageIncludes)) {
    throw new Error(
      `expected error message to include ${
        JSON.stringify(messageIncludes)
      }, got ${JSON.stringify(thrown.message)}`,
    );
  }
}
