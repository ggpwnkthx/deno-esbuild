import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.19";
import {
  createChannelWithFakeStream,
  encodeFramed,
  encodeResponse,
} from "./_helpers.ts";

Deno.test("service.formatMessages() throws when options is missing", async () => {
  const { channel, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  assertThrows(
    () =>
      channel.service.formatMessages({
        callName: "formatMessages",
        refs: null,
        messages: [],
        // @ts-expect-error testing missing options
        options: undefined,
        callback: () => {},
      }),
    Error,
    "Missing second argument in formatMessages() call",
  );
});

Deno.test("service.formatMessages() throws when kind is missing", async () => {
  const { channel, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  assertThrows(
    () =>
      channel.service.formatMessages({
        callName: "formatMessages",
        refs: null,
        messages: [],
        // @ts-expect-error testing missing kind
        options: {},
        callback: () => {},
      }),
    Error,
    'Missing "kind" in formatMessages() call',
  );
});

Deno.test("service.formatMessages() throws when kind is not error or warning", async () => {
  const { channel, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  assertThrows(
    () =>
      channel.service.formatMessages({
        callName: "formatMessages",
        refs: null,
        messages: [],
        // @ts-expect-error testing invalid kind value
        options: { kind: "invalid" },
        callback: () => {},
      }),
    Error,
    'Expected "kind" to be "error" or "warning" in formatMessages() call',
  );
});

Deno.test("service.formatMessages() forwards color and terminalWidth into the request packet", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  channel.service.formatMessages({
    callName: "formatMessages",
    refs: null,
    messages: [],
    options: { kind: "error", color: true, terminalWidth: 80 },
    callback: () => {},
  });
  const packets = fake.getStdinPackets();
  assertEquals(packets[0].value.color, true);
  assertEquals(packets[0].value.terminalWidth, 80);
});

Deno.test("service.formatMessages() sanitizes the messages array before sending", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  channel.service.formatMessages({
    callName: "formatMessages",
    refs: null,
    messages: [
      {
        text: "error without id",
        pluginName: undefined,
        location: { file: "test.ts", line: 1, column: 0 },
      },
    ],
    options: { kind: "error" },
    callback: () => {},
  });
  const packets = fake.getStdinPackets();
  const sentMessages = packets[0].value.messages as {
    id: string;
    pluginName: string;
    text: string;
  }[];
  assertEquals(sentMessages.length, 1);
  assertEquals(sentMessages[0].id, "");
  assertEquals(sentMessages[0].pluginName, "");
  assertEquals(sentMessages[0].text, "error without id");
});

Deno.test("service.analyzeMetafile() forwards color and verbose", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  channel.service.analyzeMetafile({
    callName: "analyzeMetafile",
    refs: null,
    metafile: "test.json",
    options: { color: true, verbose: true },
    callback: () => {},
  });
  const packets = fake.getStdinPackets();
  assertEquals(packets[0].value.command, "analyze-metafile");
  assertEquals(packets[0].value.color, true);
  assertEquals(packets[0].value.verbose, true);
});

Deno.test("service.analyzeMetafile() resolves with response.result", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let callbackError: Error | null = null;
  let callbackResult: string | null = null;
  channel.service.analyzeMetafile({
    callName: "analyzeMetafile",
    refs: null,
    metafile: "test.json",
    options: {},
    callback: (err, res) => {
      callbackError = err;
      callbackResult = res;
    },
  });
  const requestPacket = fake.getStdinPackets()[0];
  fake.injectFramed(
    encodeFramed(
      encodeResponse(requestPacket.id, false, { result: "analyzed output" }),
    ),
  );
  assertEquals(callbackError, null);
  assertEquals(callbackResult, "analyzed output");
});

Deno.test("service.analyzeMetafile() rejects invalid option keys", async () => {
  const { channel, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  assertThrows(
    () =>
      channel.service.analyzeMetafile({
        callName: "analyzeMetafile",
        refs: null,
        metafile: "test.json",
        options: { unknownOption: true } as { color?: boolean },
        callback: () => {},
      }),
    Error,
    'Invalid option in analyzeMetafile() call: "unknownOption"',
  );
});

Deno.test("service.transform() rejects inputs that are neither string nor Uint8Array", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  channel.service.transform({
    callName: "transform",
    refs: null,
    input: { not: "valid" } as unknown as string | Uint8Array,
    options: {},
    isTTY: false,
    fs: { readFile: () => {}, writeFile: () => {} },
    callback: () => {},
  });
  const packets = fake.getStdinPackets();
  assertEquals(packets.length, 1);
  assertEquals(packets[0].value.command, "error");
  const errorObj = packets[0].value.error as { text?: string };
  assertEquals(
    errorObj.text,
    'The input to "transform" must be a string or a Uint8Array',
  );
});

Deno.test("service.transform() sends inline input when input.length <= 1 MiB", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  channel.service.transform({
    callName: "transform",
    refs: null,
    input: "small input",
    options: { loader: "js" },
    isTTY: false,
    fs: { readFile: () => {}, writeFile: () => {} },
    callback: () => {},
  });
  const packets = fake.getStdinPackets();
  assertEquals(packets[0].value.command, "transform");
  const inputValue = packets[0].value.input;
  assertEquals(inputValue instanceof Uint8Array, true);
  assertEquals(new TextDecoder().decode(inputValue as Uint8Array), "small input");
});

Deno.test("service.transform() switches to the injected fs.writeFile() path when input.length > 1 MiB", async () => {
  const { channel, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let writeFileCalled = false;
  let writeFileContents: string | Uint8Array | null = null;
  channel.service.transform({
    callName: "transform",
    refs: null,
    input: "x".repeat(2000000),
    options: { loader: "js" },
    isTTY: false,
    fs: {
      readFile: () => {},
      writeFile: (
        contents: string | Uint8Array,
        callback: (tempFile: string | null) => void,
      ) => {
        writeFileCalled = true;
        writeFileContents = contents;
        callback("/tmp/tempfile");
      },
    },
    callback: () => {},
  });
  assertEquals(writeFileCalled, true);
  assertEquals(
    writeFileContents !== null && (writeFileContents as string).length > 1024 * 1024,
    true,
  );
});

Deno.test("service.transform() reads back codeFS with injected fs.readFile()", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let readFilePath: string | null = null;
  channel.service.transform({
    callName: "transform",
    refs: null,
    input: "code",
    options: {},
    isTTY: false,
    fs: {
      readFile: (
        path: string,
        _callback: (err: Error | null, text: string | null) => void,
      ) => {
        readFilePath = path;
        _callback(null, "export const x = 1;");
      },
      writeFile: (_contents, callback) => callback(null as unknown as string),
    },
    callback: () => {},
  });
  const requestPacket = fake.getStdinPackets()[0];
  fake.injectFramed(
    encodeFramed(
      encodeResponse(requestPacket.id, false, {
        errors: [],
        warnings: [],
        codeFS: true,
        code: "/virtual/path.js",
      }),
    ),
  );
  assertEquals(readFilePath, "/virtual/path.js");
});

Deno.test("service.transform() reads back mapFS with injected fs.readFile()", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let readFilePath: string | null = null;
  channel.service.transform({
    callName: "transform",
    refs: null,
    input: "code",
    options: {},
    isTTY: false,
    fs: {
      readFile: (
        path: string,
        _callback: (err: Error | null, text: string | null) => void,
      ) => {
        readFilePath = path;
        _callback(null, '{"version":3}');
      },
      writeFile: (_contents, callback) => callback(null as unknown as string),
    },
    callback: () => {},
  });
  const requestPacket = fake.getStdinPackets()[0];
  fake.injectFramed(
    encodeFramed(
      encodeResponse(requestPacket.id, false, {
        errors: [],
        warnings: [],
        mapFS: true,
        map: "/virtual/path.map",
      }),
    ),
  );
  assertEquals(readFilePath, "/virtual/path.map");
});

Deno.test("service.transform() returns a build failure when response.errors is non-empty", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let callbackError: Error | null = null;
  channel.service.transform({
    callName: "transform",
    refs: null,
    input: "code",
    options: {},
    isTTY: false,
    fs: {
      readFile: () => {},
      writeFile: (_c, cb) => cb(null as unknown as string),
    },
    callback: (err) => {
      callbackError = err;
    },
  });
  const requestPacket = fake.getStdinPackets()[0];
  fake.injectFramed(
    encodeFramed(
      encodeResponse(requestPacket.id, false, {
        errors: [{ text: "transform error", location: null }],
        warnings: [],
      }),
    ),
  );
  assertEquals(typeof callbackError === "object" && callbackError !== null, true);
  assertEquals(
    (callbackError as unknown as Error).message.includes("transform error"),
    true,
  );
});

Deno.test("service.transform() sends the error command when option parsing throws before the normal request is sent", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  channel.service.transform({
    callName: "transform",
    refs: null,
    input: "code",
    options: { logLevel: 123 as unknown as string },
    isTTY: false,
    fs: { readFile: () => {}, writeFile: () => {} },
    callback: () => {},
  });
  const packets = fake.getStdinPackets();
  assertEquals(packets[0].value.command, "error");
  const errorObj = packets[0].value.error as { text?: string };
  assertEquals(errorObj.text, '"logLevel" must be a string');
});

Deno.test("service.buildOrContext() rejects plugin use when streamIn.isSync === true", async () => {
  const { createFakeStreamIn, createChannel, encodeFramed } = await import(
    "./_helpers.ts"
  );
  const { getModVersion } = await import("@ggpwnkthx/esbuild/install");
  const version = await getModVersion();
  const fake = createFakeStreamIn();
  fake.streamIn.isSync = true;
  const channel = createChannel(fake.streamIn, version);
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let _receivedError: Error | null = null;
  channel.service.buildOrContext({
    callName: "build",
    refs: null,
    options: { plugins: [{}] },
    isTTY: false,
    defaultWD: "/wd",
    callback: (err) => {
      _receivedError = err;
    },
  });
  const packets = fake.getStdinPackets();
  assertEquals(packets[0].value.command, "error");
  const errorObj = packets[0].value.error as { text?: string };
  assertEquals(errorObj.text, "Cannot use plugins in synchronous API calls");
});

Deno.test("service.buildOrContext() rejects write: true when streamIn.hasFS === false", async () => {
  const { createFakeStreamIn, createChannel, encodeFramed } = await import(
    "./_helpers.ts"
  );
  const { getModVersion } = await import("@ggpwnkthx/esbuild/install");
  const version = await getModVersion();
  const fake = createFakeStreamIn();
  fake.streamIn.hasFS = false;
  const channel = createChannel(fake.streamIn, version);
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  channel.service.buildOrContext({
    callName: "build",
    refs: null,
    options: { write: true },
    isTTY: false,
    defaultWD: "/wd",
    callback: () => {},
  });
  const packets = fake.getStdinPackets();
  assertEquals(packets[0].value.command, "error");
  const errorObj = packets[0].value.error as { text?: string };
  assertEquals(errorObj.text, 'The "write" option is unavailable in this environment');
});

Deno.test("service.buildOrContext() uses defaultWD when absWorkingDir is omitted", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  channel.service.buildOrContext({
    callName: "build",
    refs: null,
    options: { entryPoints: ["a.ts"] },
    isTTY: false,
    defaultWD: "/project/root",
    callback: () => {},
  });
  const packets = fake.getStdinPackets();
  assertEquals(packets[0].value.absWorkingDir, "/project/root");
});

Deno.test("service.buildOrContext() sends a build request with the generated flags and entries", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  channel.service.buildOrContext({
    callName: "build",
    refs: null,
    options: {
      entryPoints: ["src/index.ts"],
      outfile: "dist/bundle.js",
      minify: true,
    },
    isTTY: false,
    defaultWD: "/wd",
    callback: () => {},
  });
  const packets = fake.getStdinPackets();
  const packetValue = packets[0].value as {
    command: string;
    entries: string[][];
    flags: string[];
  };
  assertEquals(packetValue.command, "build");
  assertEquals(packetValue.entries, [["", "src/index.ts"]]);
  assertEquals(packetValue.flags.some((f) => f === "--minify"), true);
  assertEquals(packetValue.flags.some((f) => f.startsWith("--outfile=")), true);
});

Deno.test("service.buildOrContext() returns a build failure when the initial response contains errors", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let callbackError: Error | null = null;
  channel.service.buildOrContext({
    callName: "build",
    refs: null,
    options: { entryPoints: ["a.ts"] },
    isTTY: false,
    defaultWD: "/wd",
    callback: (err) => {
      callbackError = err;
    },
  });
  const requestPacket = fake.getStdinPackets()[0];
  fake.injectFramed(
    encodeFramed(
      encodeResponse(requestPacket.id, false, {
        errors: [{ text: "build error", location: null }],
        warnings: [],
      }),
    ),
  );
  assertEquals(typeof callbackError === "object" && callbackError !== null, true);
  assertEquals(
    (callbackError as unknown as Error).message.includes("build error"),
    true,
  );
});

Deno.test("service.buildOrContext() converts response.outputFiles via convertOutputFiles()", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let callbackResult: unknown = null;
  channel.service.buildOrContext({
    callName: "build",
    refs: null,
    options: { entryPoints: ["a.ts"], write: false },
    isTTY: false,
    defaultWD: "/wd",
    callback: (_err, res) => {
      callbackResult = res;
    },
  });
  const requestPacket = fake.getStdinPackets()[0];
  const contents = new Uint8Array([104, 101, 108, 108, 111]);
  fake.injectFramed(
    encodeFramed(
      encodeResponse(requestPacket.id, false, {
        errors: [],
        warnings: [],
        outputFiles: [{ path: "/out.js", contents, hash: "abc" }],
      }),
    ),
  );
  const result = callbackResult as {
    outputFiles: { path: string; contents: Uint8Array; hash: string; text: string }[];
  };
  assertEquals(result.outputFiles[0].path, "/out.js");
  assertEquals(result.outputFiles[0].text, "hello");
});

Deno.test("service.buildOrContext() parses response.metafile via the local parseJSON() helper", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let callbackResult: unknown = null;
  channel.service.buildOrContext({
    callName: "build",
    refs: null,
    options: { entryPoints: ["a.ts"], metafile: true },
    isTTY: false,
    defaultWD: "/wd",
    callback: (_err, res) => {
      callbackResult = res;
    },
  });
  const requestPacket = fake.getStdinPackets()[0];
  fake.injectFramed(
    encodeFramed(
      encodeResponse(requestPacket.id, false, {
        errors: [],
        warnings: [],
        metafile: new TextEncoder().encode('{"outputs": {}}'),
      }),
    ),
  );
  const result = callbackResult as { metafile: { outputs: Record<string, unknown> } };
  assertEquals(typeof result.metafile, "object");
});

Deno.test("service.buildOrContext() writes writeToStdout to console.log after UTF-8 decoding", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  const logs: string[] = [];
  const originalLog = console.log;
  try {
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
    channel.service.buildOrContext({
      callName: "build",
      refs: null,
      options: { entryPoints: ["a.ts"] },
      isTTY: false,
      defaultWD: "/wd",
      callback: () => {},
    });
    const packets = fake.getStdinPackets();
    const buildPacket = packets.find((p) => p.value.command === "build");
    if (buildPacket) {
      fake.injectFramed(
        encodeFramed(
          encodeResponse(buildPacket.id, false, {
            errors: [],
            warnings: [],
            writeToStdout: new TextEncoder().encode("Hi\n"),
          }),
        ),
      );
    }
    assertEquals(logs.some((l) => l.includes("Hi")), true);
  } finally {
    console.log = originalLog;
  }
});

Deno.test("service.buildOrContext({ callName: context }) returns an object with rebuild, watch, serve, cancel, and dispose", async () => {
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
  const requestPacket = fake.getStdinPackets()[0];
  fake.injectFramed(
    encodeFramed(
      encodeResponse(requestPacket.id, false, { errors: [], warnings: [], key: 1 }),
    ),
  );
  const ctx = contextResult as {
    rebuild: () => unknown;
    watch: () => unknown;
    serve: () => unknown;
    cancel: () => unknown;
    dispose: () => unknown;
  };
  assertEquals(typeof ctx.rebuild, "function");
  assertEquals(typeof ctx.watch, "function");
  assertEquals(typeof ctx.serve, "function");
  assertEquals(typeof ctx.cancel, "function");
  assertEquals(typeof ctx.dispose, "function");
});
