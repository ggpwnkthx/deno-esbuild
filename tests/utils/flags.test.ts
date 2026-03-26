import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.19";
import {
  buildLogLevelDefault,
  encodeUTF8,
  flagsForBuildOptions,
  flagsForTransformOptions,
  pushCommonFlags,
  pushLogFlags,
  transformLogLevelDefault,
} from "@ggpwnkthx/esbuild/utils";

Deno.test("pushLogFlags() emits --color=true when color is true", () => {
  const flags: string[] = [];
  const options: Record<string, unknown> = { color: true };
  const keys: Record<string, boolean> = {};
  pushLogFlags(flags, options, keys, false, buildLogLevelDefault);
  assertEquals(flags, ["--color=true", "--log-level=warning", "--log-limit=0"]);
});

Deno.test("pushLogFlags() emits --color=true when color is omitted and isTTY is true", () => {
  const flags: string[] = [];
  const options: Record<string, unknown> = {};
  const keys: Record<string, boolean> = {};
  pushLogFlags(flags, options, keys, true, buildLogLevelDefault);
  assertEquals(flags, ["--color=true", "--log-level=warning", "--log-limit=0"]);
});

Deno.test("pushLogFlags() does not emit --color when color is omitted and isTTY is false", () => {
  const flags: string[] = [];
  const options: Record<string, unknown> = {};
  const keys: Record<string, boolean> = {};
  pushLogFlags(flags, options, keys, false, buildLogLevelDefault);
  assertEquals(flags, ["--log-level=warning", "--log-limit=0"]);
});

Deno.test("pushLogFlags() respects explicit color: false", () => {
  const flags: string[] = [];
  const options: Record<string, unknown> = { color: false };
  const keys: Record<string, boolean> = {};
  pushLogFlags(flags, options, keys, true, buildLogLevelDefault);
  assertEquals(flags, ["--color=false", "--log-level=warning", "--log-limit=0"]);
});

Deno.test("pushLogFlags() uses provided logLevel", () => {
  const flags: string[] = [];
  const options: Record<string, unknown> = { logLevel: "debug" };
  const keys: Record<string, boolean> = {};
  pushLogFlags(flags, options, keys, false, buildLogLevelDefault);
  assertEquals(flags, ["--log-level=debug", "--log-limit=0"]);
});

Deno.test("pushLogFlags() uses provided logLimit", () => {
  const flags: string[] = [];
  const options: Record<string, unknown> = { logLimit: 100 };
  const keys: Record<string, boolean> = {};
  pushLogFlags(flags, options, keys, false, buildLogLevelDefault);
  assertEquals(flags, ["--log-level=warning", "--log-limit=100"]);
});

Deno.test("pushLogFlags() falls back to the provided default log level", () => {
  const flags: string[] = [];
  const options: Record<string, unknown> = {};
  const keys: Record<string, boolean> = {};
  pushLogFlags(flags, options, keys, false, buildLogLevelDefault);
  assertEquals(flags, ["--log-level=warning", "--log-limit=0"]);
});

Deno.test("pushCommonFlags() emits flags for representative common options", () => {
  const flags: string[] = [];
  const options: Record<string, unknown> = {
    format: "esm",
    target: "es2020",
    platform: "browser",
    minify: true,
    jsx: "automatic",
    define: { DEBUG: "false" },
    pure: ["func"],
    keepNames: true,
  };
  const keys: Record<string, boolean> = {};
  pushCommonFlags(flags, options, keys);
  assertEquals(flags, [
    "--target=es2020",
    "--format=esm",
    "--platform=browser",
    "--minify",
    "--jsx=automatic",
    "--define:DEBUG=false",
    "--pure:func",
    "--keep-names",
  ]);
});

Deno.test("pushCommonFlags() serializes tsconfigRaw as a string", () => {
  const flags: string[] = [];
  const options: Record<string, unknown> = { tsconfigRaw: "my-tsconfig.json" };
  const keys: Record<string, boolean> = {};
  pushCommonFlags(flags, options, keys);
  assertEquals(flags, ["--tsconfig-raw=my-tsconfig.json"]);
});

Deno.test("pushCommonFlags() serializes tsconfigRaw as an object", () => {
  const flags: string[] = [];
  const options: Record<string, unknown> = {
    tsconfigRaw: { compilerOptions: { strict: true } },
  };
  const keys: Record<string, boolean> = {};
  pushCommonFlags(flags, options, keys);
  assertEquals(flags, [
    `--tsconfig-raw=${JSON.stringify({ compilerOptions: { strict: true } })}`,
  ]);
});

Deno.test("pushCommonFlags() rejects invalid define keys containing =", () => {
  const flags: string[] = [];
  const options: Record<string, unknown> = { define: { "KEY=VALUE": "true" } };
  const keys: Record<string, boolean> = {};
  assertThrows(
    () => pushCommonFlags(flags, options, keys),
    Error,
    "Invalid define: KEY=VALUE",
  );
});

Deno.test("pushCommonFlags() rejects invalid logOverride keys containing =", () => {
  const flags: string[] = [];
  const options: Record<string, unknown> = { logOverride: { "KEY=VALUE": "debug" } };
  const keys: Record<string, boolean> = {};
  assertThrows(
    () => pushCommonFlags(flags, options, keys),
    Error,
    "Invalid log override: KEY=VALUE",
  );
});

Deno.test("pushCommonFlags() rejects invalid supported keys containing =", () => {
  const flags: string[] = [];
  const options: Record<string, unknown> = { supported: { "KEY=VALUE": true } };
  const keys: Record<string, boolean> = {};
  assertThrows(
    () => pushCommonFlags(flags, options, keys),
    Error,
    "Invalid supported: KEY=VALUE",
  );
});

Deno.test("pushCommonFlags() rejects non-boolean values inside supported", () => {
  const flags: string[] = [];
  const options: Record<string, unknown> = { supported: { esm: "yes" } };
  const keys: Record<string, boolean> = {};
  assertThrows(
    () => pushCommonFlags(flags, options, keys),
    Error,
    'Expected value for supported "esm" to be a boolean, got string instead',
  );
});

Deno.test("pushCommonFlags() serializes mangleProps using jsRegExpToGoRegExp()", () => {
  const flags: string[] = [];
  const options: Record<string, unknown> = { mangleProps: /foo/g };
  const keys: Record<string, boolean> = {};
  pushCommonFlags(flags, options, keys);
  assertEquals(flags, ["--mangle-props=(?g)foo"]);
});

Deno.test("pushCommonFlags() serializes reserveProps using jsRegExpToGoRegExp()", () => {
  const flags: string[] = [];
  const options: Record<string, unknown> = { reserveProps: /bar/i };
  const keys: Record<string, boolean> = {};
  pushCommonFlags(flags, options, keys);
  assertEquals(flags, ["--reserve-props=(?i)bar"]);
});

Deno.test("flagsForBuildOptions() returns expected result for maximal build config", () => {
  const options = {
    entryPoints: ["src/index.ts"],
    outfile: "dist/bundle.js",
    sourcemap: true,
    minify: true,
    platform: "browser",
    target: "es2020",
    logLevel: "debug",
    logLimit: 50,
    define: { DEBUG: "false" },
    format: "esm",
    banner: { js: "/* banner */" },
    footer: { js: "/* footer */" },
    loader: { ".png": "dataurl" },
    outExtension: { ".js": ".mjs" },
    alias: { $fs: "fs" },
    external: ["fs", "path"],
    logOverride: { "could-not-find-module": "debug" },
    supported: { esm: true },
    pure: ["func"],
    keepNames: true,
    jsx: "automatic",
    mangleProps: /_/g,
    reserveProps: /^$/,
    splitting: true,
    metafile: true,
    mangleCache: { $prop: "renamed" },
    stdin: { contents: "const x = 1;", loader: "ts" },
    absWorkingDir: "/project",
    nodePaths: ["/lib"],
    packages: "external",
  };
  const result = flagsForBuildOptions(
    "build",
    options,
    false,
    buildLogLevelDefault,
    true,
  );
  assertEquals(result.flags.includes("--sourcemap"), true);
  assertEquals(result.flags.includes("--minify"), true);
  assertEquals(result.flags.includes("--splitting"), true);
  assertEquals(result.flags.includes("--metafile"), true);
  assertEquals(result.flags.includes("--keep-names"), true);
  assertEquals(result.flags.includes("--banner:js=/* banner */"), true);
  assertEquals(result.flags.includes("--footer:js=/* footer */"), true);
  assertEquals(result.flags.includes("--alias:$fs=fs"), true);
  assertEquals(result.flags.includes("--external:fs"), true);
  assertEquals(result.flags.includes("--external:path"), true);
  assertEquals(result.flags.includes("--loader:.png=dataurl"), true);
  assertEquals(result.flags.includes("--out-extension:.js=.mjs"), true);
  assertEquals(result.flags.includes("--log-level=debug"), true);
  assertEquals(result.flags.includes("--log-limit=50"), true);
  assertEquals(result.flags.includes("--define:DEBUG=false"), true);
  assertEquals(result.flags.includes("--format=esm"), true);
  assertEquals(result.flags.includes("--platform=browser"), true);
  assertEquals(result.flags.includes("--target=es2020"), true);
  assertEquals(
    result.flags.includes("--log-override:could-not-find-module=debug"),
    true,
  );
  assertEquals(result.flags.includes("--supported:esm=true"), true);
  assertEquals(result.flags.includes("--pure:func"), true);
  assertEquals(result.flags.includes("--jsx=automatic"), true);
  assertEquals(result.flags.includes("--mangle-props=(?g)_"), true);
  assertEquals(result.flags.includes("--reserve-props=^$"), true);
  assertEquals(result.flags.includes("--packages=external"), true);
  assertEquals(result.entries, [["", "src/index.ts"]]);
  assertEquals(result.write, true);
  assertEquals(result.stdinContents, encodeUTF8("const x = 1;"));
  assertEquals(result.stdinResolveDir, null);
  assertEquals(result.absWorkingDir, "/project");
  assertEquals(result.nodePaths, ["/lib"]);
  assertEquals(result.mangleCache, { $prop: "renamed" });
});

Deno.test("flagsForBuildOptions() accepts entryPoints as an array of strings", () => {
  const options = { entryPoints: ["a.ts", "b.ts"] };
  const result = flagsForBuildOptions(
    "build",
    options,
    false,
    buildLogLevelDefault,
    false,
  );
  assertEquals(result.entries, [["", "a.ts"], ["", "b.ts"]]);
  assertEquals(result.write, false);
});

Deno.test("flagsForBuildOptions() accepts entryPoints as an object map", () => {
  const options = { entryPoints: { "dist/a.js": "src/a.ts", "dist/b.js": "src/b.ts" } };
  const result = flagsForBuildOptions(
    "build",
    options,
    false,
    buildLogLevelDefault,
    false,
  );
  assertEquals(result.entries, [["dist/a.js", "src/a.ts"], ["dist/b.js", "src/b.ts"]]);
});

Deno.test("flagsForBuildOptions() accepts structured entry points with in and out", () => {
  const options = { entryPoints: [{ in: "src/a.ts", out: "dist/a.js" }] };
  const result = flagsForBuildOptions(
    "build",
    options,
    false,
    buildLogLevelDefault,
    false,
  );
  assertEquals(result.entries, [["dist/a.js", "src/a.ts"]]);
});

Deno.test("flagsForBuildOptions() throws when a structured entry point is missing in", () => {
  const options = { entryPoints: [{ out: "dist/a.js" }] };
  assertThrows(
    () => flagsForBuildOptions("build", options, false, buildLogLevelDefault, false),
    Error,
    'Missing property "in" for entry point at index 0',
  );
});

Deno.test("flagsForBuildOptions() throws when a structured entry point is missing out", () => {
  const options = { entryPoints: [{ in: "src/a.ts" }] };
  assertThrows(
    () => flagsForBuildOptions("build", options, false, buildLogLevelDefault, false),
    Error,
    'Missing property "out" for entry point at index 0',
  );
});

Deno.test("flagsForBuildOptions() encodes stdin.contents when it is a string", () => {
  const options = { entryPoints: ["a.ts"], stdin: { contents: "const x = 1;" } };
  const result = flagsForBuildOptions(
    "build",
    options,
    false,
    buildLogLevelDefault,
    false,
  );
  assertEquals(result.stdinContents, encodeUTF8("const x = 1;"));
  assertEquals(result.stdinContents instanceof Uint8Array, true);
});

Deno.test("flagsForBuildOptions() passes stdin.contents through when it is a Uint8Array", () => {
  const content = new Uint8Array([1, 2, 3]);
  const options = { entryPoints: ["a.ts"], stdin: { contents: content } };
  const result = flagsForBuildOptions(
    "build",
    options,
    false,
    buildLogLevelDefault,
    false,
  );
  assertEquals(result.stdinContents, content);
});

Deno.test("flagsForBuildOptions() uses writeDefault when write is omitted", () => {
  const result1 = flagsForBuildOptions(
    "build",
    { entryPoints: ["a.ts"] },
    false,
    buildLogLevelDefault,
    true,
  );
  assertEquals(result1.write, true);

  const result2 = flagsForBuildOptions(
    "build",
    { entryPoints: ["a.ts"] },
    false,
    buildLogLevelDefault,
    false,
  );
  assertEquals(result2.write, false);
});

Deno.test("flagsForBuildOptions() allows plugins without treating it as an invalid option", () => {
  const plugins = [{}];
  const options = { entryPoints: ["a.ts"], plugins };
  const result = flagsForBuildOptions(
    "build",
    options,
    false,
    buildLogLevelDefault,
    false,
  );
  assertEquals(result.entries, [["", "a.ts"]]);
});

Deno.test("flagsForBuildOptions() still rejects actually unknown options", () => {
  const options = { entryPoints: ["a.ts"], unknownOption: true };
  assertThrows(
    () => flagsForBuildOptions("build", options, false, buildLogLevelDefault, false),
    Error,
    'Invalid option in build() call: "unknownOption"',
  );
});

Deno.test("flagsForBuildOptions() rejects invalid alias keys containing =", () => {
  const options = { entryPoints: ["a.ts"], alias: { "key=value": "val" } };
  assertThrows(
    () => flagsForBuildOptions("build", options, false, buildLogLevelDefault, false),
    Error,
    "Invalid package name in alias: key=value",
  );
});

Deno.test("flagsForBuildOptions() rejects invalid banner keys containing =", () => {
  const options = { entryPoints: ["a.ts"], banner: { "js=es6": "/* code */" } };
  assertThrows(
    () => flagsForBuildOptions("build", options, false, buildLogLevelDefault, false),
    Error,
    "Invalid banner file type: js=es6",
  );
});

Deno.test("flagsForBuildOptions() rejects invalid footer keys containing =", () => {
  const options = { entryPoints: ["a.ts"], footer: { "js=es6": "/* code */" } };
  assertThrows(
    () => flagsForBuildOptions("build", options, false, buildLogLevelDefault, false),
    Error,
    "Invalid footer file type: js=es6",
  );
});

Deno.test("flagsForBuildOptions() rejects invalid loader keys containing =", () => {
  const options = { entryPoints: ["a.ts"], loader: { ".js=es6": "ts" } };
  assertThrows(
    () => flagsForBuildOptions("build", options, false, buildLogLevelDefault, false),
    Error,
    "Invalid loader extension: .js=es6",
  );
});

Deno.test("flagsForBuildOptions() rejects invalid outExtension keys containing =", () => {
  const options = { entryPoints: ["a.ts"], outExtension: { ".js=module": "mjs" } };
  assertThrows(
    () => flagsForBuildOptions("build", options, false, buildLogLevelDefault, false),
    Error,
    "Invalid out extension: .js=module",
  );
});

Deno.test("flagsForTransformOptions() emits transform-specific flags", () => {
  const options = {
    sourcemap: "inline",
    sourcefile: "input.ts",
    loader: "ts",
    banner: "/* header */",
    footer: "/* footer */",
    logLevel: "debug",
  };
  const result = flagsForTransformOptions(
    "transform",
    options,
    false,
    transformLogLevelDefault,
  );
  assertEquals(result.flags.includes("--sourcemap=inline"), true);
  assertEquals(result.flags.includes("--sourcefile=input.ts"), true);
  assertEquals(result.flags.includes("--loader=ts"), true);
  assertEquals(result.flags.includes("--banner=/* header */"), true);
  assertEquals(result.flags.includes("--footer=/* footer */"), true);
  assertEquals(result.flags.includes("--log-level=debug"), true);
});

Deno.test("flagsForTransformOptions() converts sourcemap: true into --sourcemap=external", () => {
  const options = { sourcemap: true };
  const result = flagsForTransformOptions(
    "transform",
    options,
    false,
    transformLogLevelDefault,
  );
  assertEquals(result.flags.includes("--sourcemap=external"), true);
});

Deno.test("flagsForTransformOptions() validates and returns mangleCache", () => {
  const options = { mangleCache: { $prop: "renamed" } };
  const result = flagsForTransformOptions(
    "transform",
    options,
    false,
    transformLogLevelDefault,
  );
  assertEquals(result.mangleCache, { $prop: "renamed" });
});

Deno.test("flagsForTransformOptions() rejects invalid option keys", () => {
  const options = { unknownTransformOption: true };
  assertThrows(
    () =>
      flagsForTransformOptions("transform", options, false, transformLogLevelDefault),
    Error,
    'Invalid option in transform() call: "unknownTransformOption"',
  );
});
