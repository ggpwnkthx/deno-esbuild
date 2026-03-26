import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert@1.0.19";
import {
  createChannel,
  decodePacket,
  encodePacket,
  type EsbuildExports,
  readUInt32LE,
  writeUInt32LE,
} from "@ggpwnkthx/esbuild/utils";
import { getModVersion } from "@ggpwnkthx/esbuild/install";
import type { BuildContext, BuildResult, TransformResult } from "@ggpwnkthx/esbuild";

interface StreamIn {
  writeToStdin(bytes: Uint8Array): void;
  isSync: boolean;
  hasFS: boolean;
  readFileSync?: (path: string, encoding: string) => string;
  esbuild: EsbuildExports;
}

function encodeFramed(packetBytes: Uint8Array): Uint8Array {
  const result = new Uint8Array(4 + packetBytes.length);
  writeUInt32LE(result, packetBytes.length, 0);
  result.set(packetBytes, 4);
  return result;
}

function encodeResponse(
  id: number,
  isRequest: boolean,
  value: Record<string, unknown>,
): Uint8Array {
  const visit = (val: unknown): void => {
    if (val === null) {
      bb.write8(0);
    } else if (typeof val === "boolean") {
      bb.write8(1);
      bb.write8(+val);
    } else if (typeof val === "number") {
      bb.write8(2);
      bb.write32(val | 0);
    } else if (typeof val === "string") {
      bb.write8(3);
      const enc = new TextEncoder().encode(val);
      bb.write(enc);
    } else if (val instanceof Uint8Array) {
      bb.write8(4);
      bb.write(val);
    } else if (Array.isArray(val)) {
      bb.write8(5);
      bb.write32(val.length);
      for (const item of val) visit(item);
    } else {
      bb.write8(6);
      const keys = Object.keys(val as Record<string, unknown>);
      bb.write32(keys.length);
      for (const key of keys) {
        const enc = new TextEncoder().encode(key);
        bb.write(enc);
        visit((val as Record<string, unknown>)[key]);
      }
    }
  };

  const bb = new ByteBuffer();
  bb.write32(id << 1 | +!isRequest);
  visit(value);
  return bb.buf.subarray(0, bb.len);
}

function createFakeStreamIn(): {
  streamIn: StreamIn;
  getStdinPackets: () => {
    id: number;
    isRequest: boolean;
    value: Record<string, unknown>;
  }[];
  injectFramed: (bytes: Uint8Array) => void;
  close: (err?: Error) => void;
  stdoutChunks: Uint8Array[];
  _setHandlers: (read: (c: Uint8Array) => void, close: (e?: Error) => void) => void;
} {
  const stdinPackets: Uint8Array[] = [];
  const stdoutChunks: Uint8Array[] = [];
  let readFromStdout: ((chunk: Uint8Array) => void) | null = null;
  let afterClose: ((err?: Error) => void) | null = null;

  const streamIn: StreamIn = {
    writeToStdin(bytes: Uint8Array) {
      stdinPackets.push(bytes);
    },
    isSync: false,
    hasFS: true,
    readFileSync: (path: string) => `content:${path}`,
    esbuild: {
      context: () => Promise.resolve({} as BuildContext),
      build: () => Promise.resolve({ errors: [], warnings: [] } as BuildResult),
      buildSync: () => ({ errors: [], warnings: [] } as BuildResult),
      transform: () =>
        Promise.resolve({ code: "", map: "", warnings: [] } as TransformResult),
      transformSync: () => ({ code: "", map: "", warnings: [] } as TransformResult),
      formatMessages: () => Promise.resolve([] as string[]),
      formatMessagesSync: () => [] as string[],
      analyzeMetafile: () => Promise.resolve(""),
      analyzeMetafileSync: () => "",
      initialize: () => Promise.resolve(),
      stop: () => {},
      version: "0.0.0",
    },
  };

  return {
    streamIn,
    getStdinPackets() {
      return stdinPackets.map((p) => {
        assertEquals(readUInt32LE(p, 0), p.length - 4);
        return decodePacket(p.subarray(4)) as {
          id: number;
          isRequest: boolean;
          value: Record<string, unknown>;
        };
      });
    },
    injectFramed(bytes: Uint8Array) {
      if (readFromStdout) {
        readFromStdout(bytes);
      }
      stdoutChunks.push(bytes);
    },
    close(err?: Error) {
      if (afterClose) afterClose(err);
    },
    stdoutChunks,
    _setHandlers(
      read: (c: Uint8Array) => void,
      close: (e?: Error) => void,
    ) {
      readFromStdout = read;
      afterClose = close;
    },
  };
}

async function createChannelWithFakeStream(): Promise<{
  channel: ReturnType<typeof createChannel>;
  fake: ReturnType<typeof createFakeStreamIn>;
  version: string;
}> {
  const version = await getModVersion();
  const fake = createFakeStreamIn();
  const channel = createChannel(fake.streamIn, version);
  fake._setHandlers(
    (chunk: Uint8Array) => channel.readFromStdout(chunk),
    (err?: Error) => channel.afterClose(err),
  );
  return { channel, fake, version };
}

Deno.test("createChannel().readFromStdout() rejects a first packet whose version does not match", async () => {
  const { fake, version } = await createChannelWithFakeStream();
  const badVersion = encodeFramed(new TextEncoder().encode("1.0.0"));
  assertThrows(
    () => fake.injectFramed(badVersion),
    Error,
    `Host version "${version}" does not match binary version`,
  );
});

Deno.test("createChannel().readFromStdout() accepts the correct handshake packet", async () => {
  const { fake, version } = await createChannelWithFakeStream();
  const handshake = encodeFramed(new TextEncoder().encode(version));
  fake.injectFramed(handshake);
});

Deno.test("createChannel().readFromStdout() reassembles a packet split across multiple stdout chunks", async () => {
  const { fake, version } = await createChannelWithFakeStream();
  const handshake = encodeFramed(new TextEncoder().encode(version));
  fake.injectFramed(handshake);
  const packet = encodePacket({ id: 1, isRequest: true, value: { command: "ping" } });
  const chunk1 = packet.subarray(0, 5);
  const chunk2 = packet.subarray(5);
  fake.injectFramed(chunk1);
  fake.injectFramed(chunk2);
  const packets = fake.getStdinPackets();
  const response = packets[packets.length - 1];
  assertEquals(response.id, 1);
  assertEquals(response.isRequest, false);
});

Deno.test("createChannel().readFromStdout() processes multiple framed packets delivered in one chunk", async () => {
  const { fake, version } = await createChannelWithFakeStream();
  const handshake = encodeFramed(new TextEncoder().encode(version));
  fake.injectFramed(handshake);
  const packet1 = encodePacket({ id: 1, isRequest: true, value: { command: "ping" } });
  const packet2 = encodePacket({ id: 2, isRequest: true, value: { command: "ping" } });
  const combined = new Uint8Array(packet1.length + packet2.length);
  combined.set(packet1, 0);
  combined.set(packet2, packet1.length);
  fake.injectFramed(combined);
  const packets = fake.getStdinPackets();
  const responses = packets.filter((p) => !p.isRequest);
  assertEquals(responses.length, 2);
  assertEquals(responses[0].id, 1);
  assertEquals(responses[1].id, 2);
});

Deno.test("service.formatMessages() sends a request packet through streamIn.writeToStdin()", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  channel.service.formatMessages({
    callName: "formatMessages",
    refs: null,
    messages: [{ text: "error message" }],
    options: { kind: "error" as const },
    callback: () => {},
  });
  const packets = fake.getStdinPackets();
  assertEquals(packets.length, 1);
  assertEquals(packets[0].value.command, "format-msgs");
  assertEquals((packets[0].value.messages as unknown[]).length, 1);
  assertEquals(
    (packets[0].value.messages as { text: string }[])[0].text,
    "error message",
  );
});

Deno.test("A response packet with matching id resolves the pending callback", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let callbackError: Error | null = null;
  let callbackResult: unknown = null;
  channel.service.formatMessages({
    callName: "formatMessages",
    refs: null,
    messages: [],
    options: { kind: "warning" as const },
    callback: (err, res) => {
      callbackError = err;
      callbackResult = res;
    },
  });
  const requestPacket = fake.getStdinPackets()[0];
  fake.injectFramed(
    encodeFramed(
      encodeResponse(requestPacket.id, false, { messages: ["formatted message"] }),
    ),
  );
  assertEquals(callbackError, null);
  assertEquals(callbackResult, ["formatted message"]);
});

Deno.test("A response packet containing .error is surfaced as an error to the callback", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let callbackError: Error | null = null;
  let callbackResult: unknown = null;
  channel.service.formatMessages({
    callName: "formatMessages",
    refs: null,
    messages: [],
    options: { kind: "error" as const },
    callback: (err, res) => {
      callbackError = err;
      callbackResult = res;
    },
  });
  const requestPacket = fake.getStdinPackets()[0];
  fake.injectFramed(
    encodeFramed(
      encodeResponse(requestPacket.id, false, { error: "something went wrong" }),
    ),
  );
  assertEquals(
    typeof callbackError === "object" && callbackError !== null
      && (callbackError as Error).message === "something went wrong",
    true,
  );
  assertEquals(callbackResult, null);
});

Deno.test("afterClose() fails all pending response callbacks with The service was stopped", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let callback1Error: Error | string | null = null;
  let callback2Error: Error | string | null = null;
  channel.service.formatMessages({
    callName: "formatMessages",
    refs: null,
    messages: [],
    options: { kind: "error" as const },
    callback: (err) => {
      callback1Error = err;
    },
  });
  channel.service.formatMessages({
    callName: "formatMessages",
    refs: null,
    messages: [],
    options: { kind: "warning" as const },
    callback: (err) => {
      callback2Error = err;
    },
  });
  fake.close(new Error("intentional stop"));
  assertEquals(
    typeof callback1Error === "object" && callback1Error !== null
      && (callback1Error as Error).message.includes("The service was stopped"),
    true,
  );
  assertEquals(
    typeof callback2Error === "object" && callback2Error !== null
      && (callback2Error as Error).message.includes("The service was stopped"),
    true,
  );
});

Deno.test("After afterClose(), service methods fail immediately with The service is no longer running", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  fake.close();
  let callbackError: Error | null = null;
  channel.service.formatMessages({
    callName: "formatMessages",
    refs: null,
    messages: [],
    options: { kind: "error" as const },
    callback: (err) => {
      callbackError = err;
    },
  });
  assertEquals(typeof callbackError === "object" && callbackError !== null, true);
  assertEquals(
    (callbackError as unknown as Error).message.includes(
      "The service is no longer running",
    ),
    true,
  );
});

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

Deno.test("context.watch() throws when streamIn.hasFS === false", async () => {
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
  const ctx = contextResult as { watch: (opts?: { delay?: number }) => Promise<void> };
  ctx.watch({ delay: 500 });
  const watchPackets = fake.getStdinPackets();
  const watchPacket = watchPackets.find((p) => p.value.command === "watch");
  assert(watchPacket !== undefined);
  fake.injectFramed(
    encodeFramed(
      encodeResponse(watchPacket.id, false, { errors: [], warnings: [] }),
    ),
  );
  assertEquals(
    watchPackets.some(
      (p) => p.value.command === "watch" && p.value.delay === 500,
    ),
    true,
  );
});

Deno.test("context.serve() throws when streamIn.hasFS === false", async () => {
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
  };
  ctx.serve({
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
  };
  await ctx.serve({ onRequest: () => {} });
  const packets = fake.getStdinPackets();
  const servePacket = packets.find((p) => p.value.command === "serve");
  assert(servePacket !== undefined);
  assertEquals(servePacket.value.onRequest, true);
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
      encodeResponse(cancelPacket.id, false, { errors: [], warnings: [] }),
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

Deno.test("An incoming request with command: ping triggers an empty response", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  fake.injectFramed(
    encodeFramed(encodeResponse(99, true, { command: "ping" })),
  );
  const packets = fake.getStdinPackets();
  const response = packets[packets.length - 1];
  assertEquals(response.isRequest, false);
  assertEquals(response.id, 99);
  assertEquals(response.value, {});
});

Deno.test("An incoming request with an unknown command returns an error response", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  fake.injectFramed(
    encodeFramed(
      encodeResponse(99, true, { command: "unknown-cmd" }),
    ),
  );
  const packets = fake.getStdinPackets();
  const response = packets[packets.length - 1];
  assertEquals(response.isRequest, false);
  assertEquals(response.id, 99);
  const responseValue = response.value as { errors?: unknown[] };
  assertEquals(responseValue.errors?.length, 1);
});

Deno.test("An incoming request with an unknown key is ignored", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  const initialPacketCount = fake.getStdinPackets().length;
  fake.injectFramed(
    encodeFramed(encodeResponse(99, true, {
      command: "on-load",
      key: 99999,
    })),
  );
  const packets = fake.getStdinPackets();
  assertEquals(packets.length, initialPacketCount);
});

class ByteBuffer {
  buf: Uint8Array;
  len: number;
  ptr: number;

  constructor(buf: Uint8Array = new Uint8Array(1024)) {
    this.buf = buf;
    this.len = 0;
    this.ptr = 0;
  }

  _write(delta: number): number {
    if (this.len + delta > this.buf.length) {
      const clone = new Uint8Array((this.len + delta) * 2);
      clone.set(this.buf);
      this.buf = clone;
    }
    this.len += delta;
    return this.len - delta;
  }

  write8(value: number): void {
    const offset = this._write(1);
    this.buf[offset] = value;
  }

  write32(value: number): void {
    const offset = this._write(4);
    this.buf[offset] = value;
    this.buf[offset + 1] = value >> 8;
    this.buf[offset + 2] = value >> 16;
    this.buf[offset + 3] = value >> 24;
  }

  write(bytes: Uint8Array): void {
    const offset = this._write(4 + bytes.length);
    this.buf[offset] = bytes.length;
    this.buf[offset + 1] = bytes.length >> 8;
    this.buf[offset + 2] = bytes.length >> 16;
    this.buf[offset + 3] = bytes.length >> 24;
    this.buf.set(bytes, offset + 4);
  }
}
