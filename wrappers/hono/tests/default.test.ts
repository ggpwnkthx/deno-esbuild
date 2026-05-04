import { assertEquals, assertStringIncludes } from "@std/assert";
import { Hono } from "hono";
import * as esbuild from "esbuild";
import esbuildMiddleware from "../mod.ts";

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

Deno.test("default transpiler transforms TypeScript responses", async () => {
  const app = createApp();

  const res = await app.request("http://localhost/mod.ts");
  const body = await res.text();

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "text/javascript");
  assertEquals(res.headers.has("content-length"), false);

  assertStringIncludes(body, "export const value = 1;");
  assertEquals(body.includes(": number"), false);
});

Deno.test("cache: true skips esbuild.transform on repeat requests", async () => {
  let transformCallCount = 0;
  const mockEsbuild = {
    transform: (input: string, _opts?: esbuild.TransformOptions) => {
      transformCallCount++;
      return { code: input.replace(": number", "") };
    },
    stop: () => {
      // no-op for mock
    },
  };

  const app = new Hono();
  app.use(
    "*",
    esbuildMiddleware({
      cache: true,
      esbuild: mockEsbuild as unknown as typeof esbuild,
    }),
  );
  app.use("*", async (c) =>
    await c.body(source, 200, {
      "content-type": "application/typescript",
      "content-length": String(source.length),
    }));

  // First request - should call transform
  const res1 = await app.request("http://localhost/cached.ts");
  assertEquals(res1.status, 200);
  assertEquals(transformCallCount, 1);

  // Second request to same path - should NOT call transform (served from cache)
  const res2 = await app.request("http://localhost/cached.ts");
  assertEquals(res2.status, 200);
  assertEquals(
    transformCallCount,
    1,
    "transform should not be called for cached path",
  );

  const body1 = await res1.text();
  const body2 = await res2.text();
  assertEquals(body1, body2);
});
