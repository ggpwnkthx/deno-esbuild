import { assertEquals, assertMatch } from "@std/assert";
import { readManifest } from "./_helpers.ts";

Deno.test(
  "shared/common.ts ESBUILD_VERSION must match manifest.esbuildVersion (regression guard)",
  async () => {
    // Asserts the invariant that ESBUILD_VERSION in shared/common.ts must match
    // the manifest's esbuildVersion. If this test ever fails, the constants have
    // drifted and mod.ts will throw at import time.
    const commonText = await Deno.readTextFile(
      new URL("../shared/common.ts", import.meta.url),
    );
    const manifest = await readManifest();

    const match = commonText.match(
      /ESBUILD_VERSION(?:\s*:\s*\w+)?\s*=\s*"(\d+\.\d+\.\d+)"/,
    );
    if (match === null) {
      throw new Error("ESBUILD_VERSION literal not found in shared/common.ts");
    }
    const embedded = match[1];
    assertEquals(embedded, manifest.esbuildVersion);
  },
);

Deno.test(
  "mod.ts version export must resolve to manifest.esbuildVersion (regression guard)",
  async () => {
    // Asserts the invariant that mod.ts re-exports common.ESBUILD_VERSION and
    // that the value still matches the manifest's esbuildVersion. If this test
    // ever fails, the constants have drifted and mod.ts will throw at import.
    const modText = await Deno.readTextFile(
      new URL("../mod.ts", import.meta.url),
    );
    const commonText = await Deno.readTextFile(
      new URL("../shared/common.ts", import.meta.url),
    );
    const manifest = await readManifest();

    const reExport = /export const version\s*=\s*common\.ESBUILD_VERSION\s*;?/;
    if (!reExport.test(modText)) {
      throw new Error(
        "expected mod.ts to contain `export const version = common.ESBUILD_VERSION;`",
      );
    }
    const commonMatch = commonText.match(
      /ESBUILD_VERSION(?:\s*:\s*\w+)?\s*=\s*"(\d+\.\d+\.\d+)"/,
    );
    if (commonMatch === null) {
      throw new Error("ESBUILD_VERSION literal not found in shared/common.ts");
    }
    assertEquals(commonMatch[1], manifest.esbuildVersion);
  },
);

Deno.test("manifest sourceTag and sourceCommit are coherent", async () => {
  const manifest = await readManifest();
  assertMatch(manifest.sourceTag, /^v?\d+\.\d+\.\d+$/);
  assertMatch(manifest.sourceCommit, /^[0-9a-f]{40}$/);
});
