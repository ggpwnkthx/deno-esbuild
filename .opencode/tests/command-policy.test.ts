import { describe, expect, test } from "bun:test";

import { evaluateShellCommand } from "../lib/command-policy.ts";

describe("command policy", () => {
  test("rewrites package-manager run scripts to deno task", () => {
    expect(evaluateShellCommand("npm run build")).toMatchObject({
      action: "rewrite",
      replacement: "deno task build",
    });

    expect(evaluateShellCommand("bun run check -- --fix")).toMatchObject({
      action: "rewrite",
      replacement: "deno task check -- --fix",
    });
  });

  test("blocks dependency install commands", () => {
    expect(evaluateShellCommand("npm install left-pad")).toMatchObject({
      action: "block",
    });
  });

  test("does not silently translate unsafe prettier write flags", () => {
    expect(evaluateShellCommand("prettier --write .")).toMatchObject({
      action: "block",
    });
  });

  test("rewrites safe check commands", () => {
    expect(evaluateShellCommand("prettier --check .")).toMatchObject({
      action: "rewrite",
      replacement: "deno fmt --check .",
    });

    expect(evaluateShellCommand("tsc --noEmit")).toMatchObject({
      action: "rewrite",
      replacement: "deno check",
    });
  });
});
