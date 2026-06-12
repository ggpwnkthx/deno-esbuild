import {
  assert,
  assertEquals,
  assertExists,
  assertStringIncludes,
} from "@std/assert";
import { PACKAGE_DIR_URL, readManifest, sha256 } from "./_helpers.ts";

Deno.test("manifest declares the documented top-level shape", async () => {
  const manifest = await readManifest();

  assertEquals(typeof manifest.packageName, "string");
  assertEquals(manifest.packageName, "@ggpwnkthx/esbuild");
  assertEquals(typeof manifest.directory, "string");
  assertEquals(typeof manifest.version, "string");
  assertEquals(typeof manifest.esbuildVersion, "string");
  assertEquals(typeof manifest.sourceRepository, "string");
  assertStringIncludes(manifest.sourceRepository, "github.com/evanw/esbuild");
  assertEquals(typeof manifest.sourceTag, "string");
  assertEquals(typeof manifest.sourceCommit, "string");
  assertExists(manifest.wasm);
  assertExists(manifest.binaries);
  assert(Array.isArray(manifest.binaries), "binaries is an array");
  assertEquals(typeof manifest.wasm, "object");
  assertEquals(typeof manifest.wasm.path, "string");
  assertEquals(typeof manifest.wasm.sha256, "string");
  assertEquals(typeof manifest.wasm.bytes, "number");
});

Deno.test(
  "every manifest.binaries entry references an existing file with matching sha256 and bytes",
  async () => {
    const manifest = await readManifest();

    for (const entry of manifest.binaries) {
      const fileURL = new URL(entry.executablePath, PACKAGE_DIR_URL);
      const bytes = await Deno.readFile(fileURL);
      const hash = await sha256(bytes);

      assertEquals(
        bytes.length,
        entry.bytes,
        `byte count for ${entry.slug} (${entry.executablePath})`,
      );
      assertEquals(
        hash,
        entry.sha256,
        `sha256 for ${entry.slug} (${entry.executablePath})`,
      );
    }
  },
);

Deno.test("manifest.wasm path file matches the listed sha256 and bytes", async () => {
  const manifest = await readManifest();
  const wasmURL = new URL(manifest.wasm.path, PACKAGE_DIR_URL);
  const bytes = await Deno.readFile(wasmURL);
  const hash = await sha256(bytes);

  assertEquals(bytes.length, manifest.wasm.bytes, "wasm byte count");
  assertEquals(hash, manifest.wasm.sha256, "wasm sha256");
});

Deno.test("manifest.wasi-preview1 entry references the bundled WASI wasm", async () => {
  const manifest = await readManifest();
  const wasi = manifest.binaries.find((e) => e.slug === "wasi-preview1");
  assertExists(wasi, "wasi-preview1 entry exists in manifest");

  const fileURL = new URL(wasi!.executablePath, PACKAGE_DIR_URL);
  const bytes = await Deno.readFile(fileURL);
  const hash = await sha256(bytes);

  assertEquals(bytes.length, wasi!.bytes, "wasi wasm byte count");
  assertEquals(hash, wasi!.sha256, "wasi wasm sha256");
  assertStringIncludes(wasi!.executablePath, "esbuild.wasm");
});

Deno.test("current Deno.build.target is selectable from the manifest", async () => {
  const manifest = await readManifest();
  const match = manifest.binaries.find(
    (e) => e.denoTarget === Deno.build.target,
  );
  // Not requiring a match: some targets (e.g. linux-musl variants) intentionally
  // have no native binary and the package falls back to the wasm path.
  if (match === undefined) {
    return;
  }
  assertEquals(typeof match.slug, "string");
  assertEquals(typeof match.executablePath, "string");
});

Deno.test("denoTarget strings are unique", async () => {
  const manifest = await readManifest();
  const targets = manifest.binaries
    .map((e) => e.denoTarget)
    .filter((t): t is string => typeof t === "string");
  const unique = new Set(targets);
  assertEquals(
    unique.size,
    targets.length,
    `expected unique denoTarget values; got ${targets.length} entries, ${unique.size} unique`,
  );
});
