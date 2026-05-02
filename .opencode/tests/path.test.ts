import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveInside } from "../lib/path.ts";

describe("path containment", () => {
  test("allows relative paths inside root", () => {
    const root = mkdtempSync(join(tmpdir(), "opencode-stack-"));
    try {
      expect(resolveInside(root, ".")).toBe(root);
      expect(resolveInside(root, "packages/api")).toContain("packages");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects traversal outside root", () => {
    const root = mkdtempSync(join(tmpdir(), "opencode-stack-"));
    try {
      expect(() => resolveInside(root, "..")).toThrow();
      expect(() => resolveInside(root, "packages/api/../../..")).toThrow();
      expect(() => resolveInside(root, "/tmp")).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
