import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.19";
import {
  canBeAnything,
  checkForInvalidFlags,
  getFlag,
  mustBeBoolean,
  mustBeFunction,
  mustBeInteger,
  mustBeString,
  mustBeValidPortNumber,
  validateAndJoinStringArray,
  validateStringValue,
} from "@ggpwnkthx/esbuild/utils";

Deno.test("canBeAnything() returns null", () => {
  assertEquals(canBeAnything(), null);
});

Deno.test("getFlag() returns undefined for absent keys", () => {
  const keys: Record<string, boolean> = {};
  assertEquals(getFlag({ port: 80 }, keys, "missing", mustBeBoolean), undefined);
  assertEquals(getFlag({ port: 80 }, keys, "host", mustBeString), undefined);
});

Deno.test("getFlag() returns the typed value for present valid keys", () => {
  const keys: Record<string, boolean> = {};
  assertEquals(getFlag({ port: 80 }, keys, "port", mustBeInteger), 80);
  assertEquals(getFlag({ host: "localhost" }, keys, "host", mustBeString), "localhost");
  assertEquals(getFlag({ enabled: true }, keys, "enabled", mustBeBoolean), true);
});

Deno.test("getFlag() throws with the project's error format for invalid values", () => {
  const keys: Record<string, boolean> = {};
  assertThrows(
    () => getFlag({ port: "80" }, keys, "port", mustBeValidPortNumber),
    Error,
    '"port" must be a valid port number',
  );
  assertThrows(
    () => getFlag({ name: 123 }, keys, "name", mustBeString),
    Error,
    '"name" must be a string',
  );
  assertThrows(
    () => getFlag({ fn: "not a function" }, keys, "fn", mustBeFunction),
    Error,
    '"fn" must be a function',
  );
});

Deno.test("checkForInvalidFlags() throws on unknown option keys", () => {
  const keys: Record<string, boolean> = { port: true };
  assertThrows(
    () => checkForInvalidFlags({ port: 80, unknown: 1 }, keys, "build"),
    Error,
    'Invalid option build: "unknown"',
  );
  assertThrows(
    () => checkForInvalidFlags({ badkey: true }, {}, "config"),
    Error,
    'Invalid option config: "badkey"',
  );
});

Deno.test("validateStringValue() includes the quoted key name in its error when provided", () => {
  assertEquals(validateStringValue("hello", "option", "port"), "hello");
  assertEquals(validateStringValue("", "option", "host"), "");

  assertThrows(
    () => validateStringValue(1, "option", "port"),
    Error,
    'Expected value for option "port" to be a string, got number instead',
  );
  assertThrows(
    () => validateStringValue(null, "option", "host"),
    Error,
    'Expected value for option "host" to be a string, got object instead',
  );
});

Deno.test("validateStringValue() omits key name when key is undefined", () => {
  assertEquals(validateStringValue("hello", "option"), "hello");

  assertThrows(
    () => validateStringValue(1, "option"),
    Error,
    "Expected value for option to be a string, got number instead",
  );
});

Deno.test("validateAndJoinStringArray() joins valid arrays and rejects entries containing commas", () => {
  assertEquals(validateAndJoinStringArray(["a", "b"], "paths"), "a,b");
  assertEquals(validateAndJoinStringArray([], "paths"), "");
  assertEquals(validateAndJoinStringArray(["alpha", "beta"], "exclude"), "alpha,beta");

  assertThrows(
    () => validateAndJoinStringArray(["a,b"], "paths"),
    Error,
    "Invalid paths: a,b",
  );
  assertThrows(
    () => validateAndJoinStringArray(["x,y,z"], "exclude"),
    Error,
    "Invalid exclude: x,y,z",
  );
  assertThrows(
    () => validateAndJoinStringArray([1, 2] as unknown as string[], "paths"),
    Error,
    "Expected value for paths to be a string, got number instead",
  );
});
