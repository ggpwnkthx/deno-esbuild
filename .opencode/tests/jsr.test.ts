import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { auditJsrPackage, findExportedSymbols, stripJsonComments } from "../lib/jsr.ts";

describe("JSR audit helpers", () => {
  test("strips JSON comments without changing URL strings", () => {
    const raw =
      '{\n  // comment\n  "url": "https://example.com/a//b",\n  "ok": true /* trailing */\n}';
    const parsed = JSON.parse(stripJsonComments(raw));

    expect(parsed).toEqual({
      url: "https://example.com/a//b",
      ok: true,
    });
  });

  test("detects direct exported symbol docs and explicit public types", () => {
    const symbols = findExportedSymbols(`
/** Adds two numbers. */
export function add(a: number, b: number): number {
  return a + b
}

export function missingType(value: string) {
  return value
}
`);

    expect(symbols).toMatchObject([
      {
        name: "add",
        documented: true,
        explicitPublicType: true,
      },
      {
        name: "missingType",
        documented: false,
        explicitPublicType: false,
      },
    ]);
  });

  test("audits a minimal JSR-ready package without blocker or major findings", async () => {
    const root = mkdtempSync(join(tmpdir(), "opencode-jsr-audit-"));

    try {
      writeFileSync(
        join(root, "deno.json"),
        JSON.stringify(
          {
            name: "@scope/example",
            version: "0.1.0",
            license: "MIT",
            exports: "./mod.ts",
          },
          null,
          2,
        ),
      );

      writeFileSync(
        join(root, "README.md"),
        [
          "# Example",
          "",
          "```ts",
          'import { add } from "jsr:@scope/example"',
          "",
          "console.log(add(1, 2))",
          "```",
          "",
        ].join("\n"),
      );

      writeFileSync(
        join(root, "mod.ts"),
        [
          "/**",
          " * Example package.",
          " *",
          " * @module",
          " */",
          "",
          "/** Adds two numbers. */",
          "export function add(a: number, b: number): number {",
          "  return a + b",
          "}",
          "",
        ].join("\n"),
      );

      mkdirSync(join(root, ".github", "workflows"), { recursive: true });
      writeFileSync(
        join(root, ".github", "workflows", "publish.yml"),
        [
          "name: Publish",
          "on:",
          "  release:",
          "    types: [published]",
          "permissions:",
          "  contents: read",
          "  id-token: write",
          "jobs:",
          "  publish:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - uses: actions/checkout@v4",
          "      - uses: denoland/setup-deno@v2",
          "      - run: deno publish",
          "",
        ].join("\n"),
      );

      const report = await auditJsrPackage(root);
      expect(report.issues.some((issue) => issue.severity === "blocker")).toBe(false);
      expect(report.issues.some((issue) => issue.severity === "major")).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
