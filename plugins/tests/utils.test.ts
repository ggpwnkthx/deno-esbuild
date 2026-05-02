import { assertEquals } from "@std/assert";
import { MediaType, RequestedModuleType } from "@deno/loader";
import {
  externalToRegex,
  getModuleType,
  getPlatform,
  mediaToLoader,
} from "../utils.ts";

Deno.test({
  name: "mediaToLoader - maps MediaType to esbuild.Loader",
  fn() {
    assertEquals(mediaToLoader(MediaType.Jsx), "jsx");
    assertEquals(mediaToLoader(MediaType.JavaScript), "js");
    assertEquals(mediaToLoader(MediaType.Mjs), "js");
    assertEquals(mediaToLoader(MediaType.Cjs), "js");
    assertEquals(mediaToLoader(MediaType.TypeScript), "ts");
    assertEquals(mediaToLoader(MediaType.Mts), "ts");
    assertEquals(mediaToLoader(MediaType.Dmts), "ts");
    assertEquals(mediaToLoader(MediaType.Dcts), "ts");
    assertEquals(mediaToLoader(MediaType.Tsx), "tsx");
    assertEquals(mediaToLoader(MediaType.Css), "css");
    assertEquals(mediaToLoader(MediaType.Json), "json");
    assertEquals(mediaToLoader(MediaType.Html), "default");
    assertEquals(mediaToLoader(MediaType.Sql), "default");
    assertEquals(mediaToLoader(MediaType.Wasm), "binary");
    assertEquals(mediaToLoader(MediaType.SourceMap), "json");
    assertEquals(mediaToLoader(MediaType.Unknown), "default");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "mediaToLoader - default branch for unknown variant",
  fn() {
    // The default branch returns "default" - exercise it with an exhaustiveness check
    // Since MediaType is a closed enum, we rely on the default branch for safety
    assertEquals(mediaToLoader(MediaType.Unknown), "default");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "getPlatform - maps browser and node platforms",
  fn() {
    assertEquals(getPlatform("browser"), "browser");
    assertEquals(getPlatform("node"), "node");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "getPlatform - neutral and undefined both return undefined",
  fn() {
    assertEquals(getPlatform("neutral"), undefined);
    assertEquals(getPlatform(undefined), undefined);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "getModuleType - determines module type from file and args",
  fn() {
    // type="text"
    assertEquals(
      getModuleType("some/file.js", { type: "text" }),
      RequestedModuleType.Text,
    );

    // type="bytes"
    assertEquals(
      getModuleType("some/file.js", { type: "bytes" }),
      RequestedModuleType.Bytes,
    );

    // type="json"
    assertEquals(
      getModuleType("some/file.js", { type: "json" }),
      RequestedModuleType.Json,
    );

    // default with .json file
    assertEquals(
      getModuleType("some/file.json", {}),
      RequestedModuleType.Json,
    );

    // default without .json file
    assertEquals(
      getModuleType("some/file.js", {}),
      RequestedModuleType.Default,
    );
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "externalToRegex - converts external specifier patterns to RegExp",
  fn() {
    // simple string
    const simple = externalToRegex("foo");
    assertEquals(simple.test("foo"), true);
    assertEquals(simple.test("foobar"), false);

    // string with glob *
    const glob = externalToRegex("foo/*");
    assertEquals(glob.test("foo/bar"), true);
    assertEquals(glob.test("foo/baz/qux"), true);
    assertEquals(glob.test("foo"), false);
    assertEquals(glob.test("bar/foo"), false);

    // string with regex special char .
    const dot = externalToRegex("foo.bar");
    assertEquals(dot.test("foo.bar"), true);
    assertEquals(dot.test("fooXbar"), false);

    // string with regex special chars ^$
    const anchors = externalToRegex("^foo$");
    assertEquals(anchors.test("^foo$"), true);
    assertEquals(anchors.test("foo"), false);

    // string with multiple special chars
    const multi = externalToRegex("foo/bar[ baz ].*");
    assertEquals(multi.test("foo/bar[ baz ].*"), true);
    assertEquals(multi.test("fooXbar[ baz ]X.*"), false);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
