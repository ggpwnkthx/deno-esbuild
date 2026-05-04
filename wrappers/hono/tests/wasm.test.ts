import { assertEquals, assertStringIncludes } from "@std/assert";
import { Hono } from "hono";
import esbuildMiddleware from "../transpilers/wasm.ts";
import * as esbuild from "esbuild";

const source = "export const value: number = 1;\n";

const createApp = (): Hono => {
  const app = new Hono();

  app.use("*", esbuildMiddleware());

  app.use("*", async (c) =>
    await c.body(source, 200, {
      "content-type": "application/typescript",
      "content-length": String(source.length),
    }));

  return app;
};

Deno.test("wasm transpiler initializes and transforms TypeScript responses", async () => {
  const app = createApp();

  const res = await app.request("http://localhost/mod.ts");
  const body = await res.text();

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "text/javascript");
  assertEquals(res.headers.has("content-length"), false);

  assertStringIncludes(body, "export const value = 1;");
  assertEquals(body.includes(": number"), false);

  await esbuild.stop();
});
