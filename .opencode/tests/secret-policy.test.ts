import { describe, expect, test } from "bun:test";

import {
  looksLikeSecretShellRead,
  looksSecret,
} from "../lib/secret-policy.ts";

describe("secret policy", () => {
  test("blocks likely secret paths", () => {
    expect(looksSecret(".env")).toBe(true);
    expect(looksSecret("secrets/prod.pem")).toBe(true);
    expect(looksSecret("credentials.json")).toBe(true);
  });

  test("allows safe env examples", () => {
    expect(looksSecret(".env.example")).toBe(false);
    expect(looksSecret(".env.sample")).toBe(false);
    expect(looksSecret(".env.template")).toBe(false);
  });

  test("uses the same exceptions for shell reads", () => {
    expect(looksLikeSecretShellRead("cat .env")).toBe(true);
    expect(looksLikeSecretShellRead("cat .env.example")).toBe(false);
  });

  test("blocks env dumping", () => {
    expect(looksLikeSecretShellRead("env")).toBe(true);
    expect(looksLikeSecretShellRead("printenv")).toBe(true);
  });
});
