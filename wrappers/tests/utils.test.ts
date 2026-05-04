import { assertEquals } from "@std/assert";
import { resolve } from "@std/path";

type esbuild = typeof import("esbuild")

/**
 * A fixed test directory for HTML middleware tests.
 * Files are created once and cleaned up on process exit.
 */
const TEST_DIR = "/tmp/deno-html-middleware-test";

/**
 * Ensures the test directory exists.
 */
export function ensureTestDir(): void {
  try {
    Deno.mkdirSync(TEST_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

/**
 * Creates a text file in the fixed test directory.
 */
export async function mkTextFile(
  name: string,
  content: string,
): Promise<{ path: string; name: string }> {
  ensureTestDir();
  const path = resolve(TEST_DIR, name);
  await Deno.writeTextFile(path, content);
  return { path, name };
}

/**
 * Cleans up the test directory.
 */
export function cleanupTestDir(): void {
  try {
    Deno.removeSync(TEST_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

// ---- Tests for cache TTL and maxSize ----

import { getCachedOrTranspile, responseCache } from "../shared.ts";

Deno.test("responseCache ttl - entry expires after TTL", async () => {
  // Track how many times transform is called
  let callCount = 0;
  const mockEsbuild = {
    transform: (input: string, _opts?: Record<string, unknown>) => {
      callCount++;
      return { code: input + "\n// transformed" };
    },
    stop: () => { },
  };

  responseCache.clear();

  // First call — should populate cache and call transform once
  await getCachedOrTranspile({
    pathname: "/test-ttl.ts",
    body: "const x = 1;",
    esbuild: mockEsbuild as unknown as esbuild,
    transformOptions: {},
    cache: true,
    shouldStop: false,
    ttl: 1, // 1ms TTL
  });

  assertEquals(callCount, 1);
  assertEquals(responseCache.size, 1);

  // Wait 10ms — well past the 1ms TTL
  await new Promise((r) => setTimeout(r, 10));

  // Second call with same pathname — should re-transform (cache miss due to TTL expiry)
  await getCachedOrTranspile({
    pathname: "/test-ttl.ts",
    body: "const x = 1;",
    esbuild: mockEsbuild as unknown as esbuild,
    transformOptions: {},
    cache: true,
    shouldStop: false,
    ttl: 1,
  });

  // transform should have been called a second time
  assertEquals(callCount, 2);

  responseCache.clear();
});

Deno.test("responseCache maxSize - oldest entry is evicted when cap is reached", async () => {
  let callCount = 0;
  const mockEsbuild = {
    transform: (input: string, _opts?: Record<string, unknown>) => {
      callCount++;
      return { code: input + "\n// transformed" };
    },
    stop: () => { },
  };

  responseCache.clear();

  // Call with maxSize: 2 for three distinct pathnames
  await getCachedOrTranspile({
    pathname: "/a.ts",
    body: "const a = 1;",
    esbuild: mockEsbuild as unknown as esbuild,
    transformOptions: {},
    cache: true,
    shouldStop: false,
    maxSize: 2,
  });

  await getCachedOrTranspile({
    pathname: "/b.ts",
    body: "const b = 2;",
    esbuild: mockEsbuild as unknown as esbuild,
    transformOptions: {},
    cache: true,
    shouldStop: false,
    maxSize: 2,
  });

  await getCachedOrTranspile({
    pathname: "/c.ts",
    body: "const c = 3;",
    esbuild: mockEsbuild as unknown as esbuild,
    transformOptions: {},
    cache: true,
    shouldStop: false,
    maxSize: 2,
  });

  // After three insertions with maxSize: 2, cache should hold exactly 2 entries
  assertEquals(responseCache.size, 2);

  // The oldest entry (/a.ts) should have been evicted, and /b.ts and /c.ts should remain
  assertEquals(responseCache.has("/a.ts"), false);
  assertEquals(responseCache.has("/b.ts"), true);
  assertEquals(responseCache.has("/c.ts"), true);

  // transform should have been called 3 times (no caching benefit due to eviction)
  assertEquals(callCount, 3);

  responseCache.clear();
});

Deno.test("responseCache ttl: 0 expires entry on next access", async () => {
  // ttl: 0 should expire immediately on re-access
  let callCount = 0;
  const mockEsbuild = {
    transform: (input: string, _opts?: Record<string, unknown>) => {
      callCount++;
      return { code: input + "\n// transformed" };
    },
    stop: () => { },
  };

  responseCache.clear();

  await getCachedOrTranspile({
    pathname: "/ttl-zero.ts",
    body: "const x = 1;",
    esbuild: mockEsbuild as unknown as esbuild,
    transformOptions: {},
    cache: true,
    shouldStop: false,
    ttl: 0,
  });

  assertEquals(callCount, 1);

  // Immediate re-access — should expire and re-transform
  await getCachedOrTranspile({
    pathname: "/ttl-zero.ts",
    body: "const x = 1;",
    esbuild: mockEsbuild as unknown as esbuild,
    transformOptions: {},
    cache: true,
    shouldStop: false,
    ttl: 0,
  });

  assertEquals(callCount, 2);

  responseCache.clear();
});

Deno.test("responseCache maxSize: 0 is treated as no limit (no O(n) scan)", async () => {
  // maxSize: 0 is invalid — should be treated as undefined (no eviction)
  let callCount = 0;
  const mockEsbuild = {
    transform: (input: string, _opts?: Record<string, unknown>) => {
      callCount++;
      return { code: input + "\n// transformed" };
    },
    stop: () => { },
  };

  responseCache.clear();

  // Insert 3 entries with maxSize: 0 — should NOT trigger eviction
  for (const path of ["/x.ts", "/y.ts", "/z.ts"]) {
    await getCachedOrTranspile({
      pathname: path,
      body: `const x = "${path}";`,
      esbuild: mockEsbuild as unknown as esbuild,
      transformOptions: {},
      cache: true,
      shouldStop: false,
      maxSize: 0,
    });
  }

  // All 3 entries should be cached (maxSize:0 is ignored, treated as no limit)
  assertEquals(responseCache.size, 3);
  assertEquals(callCount, 3);

  responseCache.clear();
});

Deno.test("responseCache ttl and maxSize work together", async () => {
  let callCount = 0;
  const mockEsbuild = {
    transform: (input: string, _opts?: Record<string, unknown>) => {
      callCount++;
      return { code: input + "\n// transformed" };
    },
    stop: () => { },
  };

  responseCache.clear();

  // Insert 3 entries with ttl: 100ms and maxSize: 2
  for (const path of ["/a.ts", "/b.ts", "/c.ts"]) {
    await getCachedOrTranspile({
      pathname: path,
      body: `const x = "${path}";`,
      esbuild: mockEsbuild as unknown as esbuild,
      transformOptions: {},
      cache: true,
      shouldStop: false,
      ttl: 100,
      maxSize: 2,
    });
  }

  // maxSize: 2 should evict oldest; ttl doesn't affect this yet
  assertEquals(responseCache.size, 2);
  assertEquals(callCount, 3);

  // Wait for TTL to expire
  await new Promise((r) => setTimeout(r, 120));

  // Next access should re-transform (TTL expired), and maxSize should still evict
  await getCachedOrTranspile({
    pathname: "/a.ts",
    body: `const x = "/a.ts";`,
    esbuild: mockEsbuild as unknown as esbuild,
    transformOptions: {},
    cache: true,
    shouldStop: false,
    ttl: 100,
    maxSize: 2,
  });

  // Should have re-transformed
  assertEquals(callCount, 4);

  responseCache.clear();
});
