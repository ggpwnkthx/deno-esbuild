import { describe, expect, test } from "bun:test";

import {
  candidateRelatedTestPaths,
  isReviewableFile,
  isTestFile,
  suggestReviewAgents,
} from "../lib/project.ts";

describe("project helpers", () => {
  test("filters ignored generated directories", () => {
    expect(isReviewableFile("src/server.ts")).toBe(true);
    expect(isReviewableFile("node_modules/pkg/index.ts")).toBe(false);
    expect(isReviewableFile(".opencode/.cache/deno/x.ts")).toBe(false);
  });

  test("detects test files and candidates", () => {
    expect(isTestFile("src/foo.test.ts")).toBe(true);
    expect(candidateRelatedTestPaths("src/foo.ts")).toContain(
      "src/foo.test.ts",
    );
    expect(candidateRelatedTestPaths("src/foo.ts")).toContain(
      "tests/src/foo.test.ts",
    );
  });

  test("suggests specialists based on changed paths", () => {
    const names = suggestReviewAgents([
      "src/routes/users.ts",
      "src/cache/index.ts",
    ]).map((item) => item.name);

    expect(names).toContain("deno-critical-reviewer");
    expect(names).toContain("deno-http-auditor");
    expect(names).toContain("deno-performance-auditor");
    expect(names).toContain("deno-test-strategist");
  });
});
