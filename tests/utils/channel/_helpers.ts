import { assertEquals } from "jsr:@std/assert@1.0.19";
import {
  createChannel,
  decodePacket,
  type EsbuildExports,
  readUInt32LE,
  writeUInt32LE,
} from "@ggpwnkthx/esbuild/utils";
import { getModVersion } from "@ggpwnkthx/esbuild/install";
import type { BuildContext, BuildResult, TransformResult } from "@ggpwnkthx/esbuild";

export { createChannel };

export interface StreamIn {
  writeToStdin(bytes: Uint8Array): void;
  isSync: boolean;
  hasFS: boolean;
  readFileSync?: (path: string, encoding: string) => string;
  esbuild: EsbuildExports;
}

export function encodeFramed(packetBytes: Uint8Array): Uint8Array {
  const result = new Uint8Array(4 + packetBytes.length);
  writeUInt32LE(result, packetBytes.length, 0);
  result.set(packetBytes, 4);
  return result;
}

export function encodeResponse(
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

export function createFakeStreamIn(): {
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

export async function createChannelWithFakeStream(): Promise<{
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

export class ByteBuffer {
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
