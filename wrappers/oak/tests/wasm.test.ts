import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { Application } from "@oak/oak";
import * as esbuild from "esbuild";
import esbuildMiddleware from "../transpilers/wasm.ts";

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

Deno.test("wasm transpiler initializes and transforms TypeScript responses", async () => {
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

  await esbuild.stop();
});
