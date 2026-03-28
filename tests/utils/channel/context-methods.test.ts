import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";
import {
  createChannelWithFakeStream,
  encodeFramed,
  encodeResponse,
} from "./_helpers.ts";

Deno.test("context.watch() throws when streamIn.hasFS === false", async () => {
  const { createFakeStreamIn, createChannel, encodeFramed } = await import(
    "./_helpers.ts"
  );
  const { getModVersion } = await import("@ggpwnkthx/esbuild/install");
  const version = await getModVersion();
  const fake = createFakeStreamIn();
  fake.streamIn.hasFS = false;
  const channel = createChannel(fake.streamIn, version);
  fake._setHandlers(
    (chunk: Uint8Array) => channel.readFromStdout(chunk),
    (err?: Error) => channel.afterClose(err),
  );
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let contextResult: unknown = null;
  channel.service.buildOrContext({
    callName: "context",
    refs: null,
    options: { entryPoints: ["a.ts"] },
    isTTY: false,
    defaultWD: "/wd",
    callback: (_err, res) => {
      contextResult = res;
    },
  });
  const packets = fake.getStdinPackets();
  const buildPacket = packets[0];
  fake.injectFramed(
    encodeFramed(
      encodeResponse(buildPacket.id, false, { errors: [], warnings: [], key: 1 }),
    ),
  );
  const ctx = contextResult as { watch: (opts?: unknown) => Promise<void> };
  await assertRejects(
    () => ctx.watch(),
    Error,
    'Cannot use the "watch" API in this environment',
  );
});

Deno.test("context.watch() sends a watch request and forwards delay", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let contextResult: unknown = null;
  channel.service.buildOrContext({
    callName: "context",
    refs: null,
    options: { entryPoints: ["a.ts"] },
    isTTY: false,
    defaultWD: "/wd",
    callback: (_err, res) => {
      contextResult = res;
    },
  });
  const buildPacket = fake.getStdinPackets()[0];
  fake.injectFramed(
    encodeFramed(
      encodeResponse(buildPacket.id, false, { errors: [], warnings: [], key: 1 }),
    ),
  );
  const ctx = contextResult as {
    watch: (opts?: { delay?: number }) => Promise<void>;
    dispose: () => Promise<void>;
  };
  const watchPromise = ctx.watch({ delay: 500 });
  const watchPackets = fake.getStdinPackets();
  const watchPacket = watchPackets.find((p) => p.value.command === "watch");
  assert(watchPacket !== undefined);
  fake.injectFramed(
    encodeFramed(
      encodeResponse(watchPacket!.id, false, { errors: [], warnings: [] }),
    ),
  );
  assertEquals(
    watchPackets.some(
      (p) => p.value.command === "watch" && p.value.delay === 500,
    ),
    true,
  );
  await watchPromise;
  await ctx.dispose();
});

Deno.test("context.serve() throws when streamIn.hasFS === false", async () => {
  const { createFakeStreamIn, createChannel, encodeFramed } = await import(
    "./_helpers.ts"
  );
  const { getModVersion } = await import("@ggpwnkthx/esbuild/install");
  const version = await getModVersion();
  const fake = createFakeStreamIn();
  fake.streamIn.hasFS = false;
  const channel = createChannel(fake.streamIn, version);
  fake._setHandlers(
    (chunk: Uint8Array) => channel.readFromStdout(chunk),
    (err?: Error) => channel.afterClose(err),
  );
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let contextResult: unknown = null;
  channel.service.buildOrContext({
    callName: "context",
    refs: null,
    options: { entryPoints: ["a.ts"] },
    isTTY: false,
    defaultWD: "/wd",
    callback: (_err, res) => {
      contextResult = res;
    },
  });
  const packets = fake.getStdinPackets();
  const buildPacket = packets[0];
  fake.injectFramed(
    encodeFramed(
      encodeResponse(buildPacket.id, false, { errors: [], warnings: [], key: 1 }),
    ),
  );
  const ctx = contextResult as { serve: (opts?: unknown) => Promise<unknown> };
  await assertRejects(
    () => ctx.serve(),
    Error,
    'Cannot use the "serve" API in this environment',
  );
});

Deno.test("context.serve() validates and forwards port, host, servedir, keyfile, certfile, fallback, and cors.origin", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let contextResult: unknown = null;
  channel.service.buildOrContext({
    callName: "context",
    refs: null,
    options: { entryPoints: ["a.ts"] },
    isTTY: false,
    defaultWD: "/wd",
    callback: (_err, res) => {
      contextResult = res;
    },
  });
  const buildPacket = fake.getStdinPackets()[0];
  fake.injectFramed(
    encodeFramed(
      encodeResponse(buildPacket.id, false, { errors: [], warnings: [], key: 1 }),
    ),
  );
  const ctx = contextResult as {
    serve: (opts?: {
      port?: number;
      host?: string;
      servedir?: string;
      keyfile?: string;
      certfile?: string;
      fallback?: string;
      cors?: { origin?: string };
    }) => Promise<unknown>;
    dispose: () => Promise<void>;
  };
  const servePromise = ctx.serve({
    port: 3000,
    host: "localhost",
    servedir: "/public",
    keyfile: "/key.pem",
    certfile: "/cert.pem",
    fallback: "/index.html",
    cors: { origin: "*" },
  });
  const servePackets = fake.getStdinPackets();
  const servePacket = servePackets.find((p) => p.value.command === "serve");
  assertEquals(servePacket?.value.port, 3000);
  assertEquals(servePacket?.value.host, "localhost");
  assertEquals(servePacket?.value.servedir, "/public");
  assertEquals(servePacket?.value.keyfile, "/key.pem");
  assertEquals(servePacket?.value.certfile, "/cert.pem");
  assertEquals(servePacket?.value.fallback, "/index.html");
  assertEquals((servePacket?.value.corsOrigin as string[])?.[0], "*");
  fake.injectFramed(
    encodeFramed(
      encodeResponse(servePacket!.id, false, {
        host: "localhost",
        port: 3000,
      }),
    ),
  );
  await servePromise;
  await ctx.dispose();
});

Deno.test("context.serve() registers a serve-request callback when onRequest is provided", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let contextResult: unknown = null;
  channel.service.buildOrContext({
    callName: "context",
    refs: null,
    options: { entryPoints: ["a.ts"] },
    isTTY: false,
    defaultWD: "/wd",
    callback: (_err, res) => {
      contextResult = res;
    },
  });
  const buildPacket = fake.getStdinPackets()[0];
  fake.injectFramed(
    encodeFramed(
      encodeResponse(buildPacket.id, false, { errors: [], warnings: [], key: 1 }),
    ),
  );
  const ctx = contextResult as {
    serve: (opts?: { onRequest?: (args: unknown) => void }) => Promise<unknown>;
    dispose: () => Promise<void>;
  };
  const servePromise = ctx.serve({ onRequest: () => {} });
  const packets = fake.getStdinPackets();
  const servePacket = packets.find((p) => p.value.command === "serve");
  assert(servePacket !== undefined);
  assertEquals(servePacket!.value.onRequest, true);
  fake.injectFramed(
    encodeFramed(
      encodeResponse(servePacket!.id, false, {
        host: "localhost",
        port: 3000,
      }),
    ),
  );
  await servePromise;
  await ctx.dispose();
});

Deno.test("context.cancel() is safe to call and resolves", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let contextResult: unknown = null;
  channel.service.buildOrContext({
    callName: "context",
    refs: null,
    options: { entryPoints: ["a.ts"] },
    isTTY: false,
    defaultWD: "/wd",
    callback: (_err, res) => {
      contextResult = res;
    },
  });
  const buildPacket = fake.getStdinPackets()[0];
  fake.injectFramed(
    encodeFramed(
      encodeResponse(buildPacket.id, false, { errors: [], warnings: [], key: 1 }),
    ),
  );
  const ctx = contextResult as { cancel: () => Promise<void> };
  const cancelPromise = ctx.cancel();
  const cancelPacket = fake.getStdinPackets().find((p) => p.value.command === "cancel");
  assert(cancelPacket !== undefined);
  fake.injectFramed(
    encodeFramed(
      encodeResponse(cancelPacket!.id, false, { errors: [], warnings: [] }),
    ),
  );
  await cancelPromise;
});

Deno.test("context.dispose() is idempotent and only unreferences once", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let contextResult: unknown = null;
  channel.service.buildOrContext({
    callName: "context",
    refs: null,
    options: { entryPoints: ["a.ts"] },
    isTTY: false,
    defaultWD: "/wd",
    callback: (_err, res) => {
      contextResult = res;
    },
  });
  const buildPacket = fake.getStdinPackets()[0];
  fake.injectFramed(
    encodeFramed(
      encodeResponse(buildPacket.id, false, { errors: [], warnings: [], key: 1 }),
    ),
  );
  const ctx = contextResult as { dispose: () => Promise<void> };
  const disposePromise = ctx.dispose();
  const disposePackets = fake.getStdinPackets().filter((p) =>
    p.value.command === "dispose"
  );
  assertEquals(disposePackets.length, 1);
  const disposePacket = disposePackets[0];
  fake.injectFramed(
    encodeFramed(
      encodeResponse(disposePacket.id, false, { errors: [], warnings: [] }),
    ),
  );
  await disposePromise;
  await ctx.dispose();
  const allDisposePackets = fake.getStdinPackets().filter((p) =>
    p.value.command === "dispose"
  );
  assertEquals(allDisposePackets.length, 1);
});
