import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { Application } from "@oak/oak";
import * as esbuild from "esbuild";
import esbuildMiddleware from "../mod.ts";

const source = "export const value: number = 1;\n";

const createApp = (): Application => {
  const app = new Application();

  app.use(esbuildMiddleware());

  app.use(async (ctx, next) => {
    // deno-lint-ignore require-await
    ctx.request.body.text = async () => source;
    ctx.request.headers.set("content-type", "application/typescript");
    await next();
  });

  return app;
};

Deno.test("default transpiler transforms TypeScript responses", async () => {
  const app = createApp();

  const res = await app.handle(
    new Request("http://localhost/mod.ts"),
  );
  assertExists(res);
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

  const app = new Application();
  app.use(
    esbuildMiddleware({
      cache: true,
      esbuild: mockEsbuild as unknown as typeof esbuild,
    }),
  );
  app.use(async (ctx, next) => {
    // deno-lint-ignore require-await
    ctx.request.body.text = async () => source;
    ctx.request.headers.set("content-type", "application/typescript");
    await next();
  });

  // First request - should call transform
  const res1 = await app.handle(
    new Request("http://localhost/cached.ts"),
  );
  assertExists(res1);
  assertEquals(res1.status, 200);
  assertEquals(transformCallCount, 1);

  // Second request to same path - should NOT call transform (served from cache)
  const res2 = await app.handle(
    new Request("http://localhost/cached.ts"),
  );
  assertExists(res2);
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
