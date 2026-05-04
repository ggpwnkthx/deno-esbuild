// The JavaScript API communicates with the Go child process over stdin/stdout
// using this protocol. It's a very simple binary protocol that uses primitives
// and nested arrays and maps. It's basically JSON with UTF-8 encoding and an
// additional byte array primitive. You must send a response after receiving a
// request because the other end is blocking on the response coming back.

import type * as types from "./types.ts";

export interface BuildRequest {
  command: "build";
  key: number;
  entries: [string, string][]; // Use an array instead of a map to preserve order
  flags: string[];
  write: boolean;
  stdinContents: Uint8Array | null;
  stdinResolveDir: string | null;
  absWorkingDir: string;
  nodePaths: string[];
  context: boolean;
  plugins?: BuildPlugin[];
  mangleCache?: Record<string, string | false>;
}

export interface ServeRequest {
  command: "serve";
  key: number;
  onRequest: boolean;
  port?: number;
  host?: string;
  servedir?: string;
  keyfile?: string;
  certfile?: string;
  fallback?: string;
  corsOrigin?: string[];
}

export interface ServeResponse {
  port: number;
  hosts: string[];
}

export interface BuildPlugin {
  name: string;
  onStart: boolean;
  onEnd: boolean;
  onResolve: { id: number; filter: string; namespace: string }[];
  onLoad: { id: number; filter: string; namespace: string }[];
}

export interface BuildResponse {
  errors: types.Message[];
  warnings: types.Message[];
  outputFiles?: BuildOutputFile[];
  metafile?: Uint8Array;
  mangleCache?: Record<string, string | false>;
  writeToStdout?: Uint8Array;
}

export interface OnEndRequest extends BuildResponse {
  command: "on-end";
}

export interface OnEndResponse {
  errors: types.Message[];
  warnings: types.Message[];
}

export interface BuildOutputFile {
  path: string;
  contents: Uint8Array;
  hash: string;
}

export interface PingRequest {
  command: "ping";
}

export interface RebuildRequest {
  command: "rebuild";
  key: number;
}

export interface RebuildResponse {
  errors: types.Message[];
  warnings: types.Message[];
}

export interface DisposeRequest {
  command: "dispose";
  key: number;
}

export interface CancelRequest {
  command: "cancel";
  key: number;
}

export interface WatchRequest {
  command: "watch";
  key: number;
  delay?: number;
}

export interface OnServeRequest {
  command: "serve-request";
  key: number;
  args: types.ServeOnRequestArgs;
}

export interface TransformRequest {
  command: "transform";
  flags: string[];
  input: Uint8Array;
  inputFS: boolean;
  mangleCache?: Record<string, string | false>;
}

export interface TransformResponse {
  errors: types.Message[];
  warnings: types.Message[];

  code: string;
  codeFS: boolean;

  map: string;
  mapFS: boolean;

  legalComments?: string;
  mangleCache?: Record<string, string | false>;
}

export interface FormatMsgsRequest {
  command: "format-msgs";
  messages: types.Message[];
  isWarning: boolean;
  color?: boolean;
  terminalWidth?: number;
}

export interface FormatMsgsResponse {
  messages: string[];
}

export interface AnalyzeMetafileRequest {
  command: "analyze-metafile";
  metafile: string;
  color?: boolean;
  verbose?: boolean;
}

export interface AnalyzeMetafileResponse {
  result: string;
}

export interface OnStartRequest {
  command: "on-start";
  key: number;
}

export interface OnStartResponse {
  errors?: types.PartialMessage[];
  warnings?: types.PartialMessage[];
}

export interface ResolveRequest {
  command: "resolve";
  key: number;
  path: string;
  pluginName: string;
  importer?: string;
  namespace?: string;
  resolveDir?: string;
  kind?: string;
  pluginData?: number;
  with?: Record<string, string>;
}

export interface ResolveResponse {
  errors: types.Message[];
  warnings: types.Message[];

  path: string;
  external: boolean;
  sideEffects: boolean;
  namespace: string;
  suffix: string;
  pluginData: number;
}

export interface OnResolveRequest {
  command: "on-resolve";
  key: number;
  ids: number[];
  path: string;
  importer: string;
  namespace: string;
  resolveDir: string;
  kind: types.ImportKind;
  pluginData: number;
  with: Record<string, string>;
}

export interface OnResolveResponse {
  id?: number;
  pluginName?: string;

  errors?: types.PartialMessage[];
  warnings?: types.PartialMessage[];

  path?: string;
  external?: boolean;
  sideEffects?: boolean;
  namespace?: string;
  suffix?: string;
  pluginData?: number;

  watchFiles?: string[];
  watchDirs?: string[];
}

export interface OnLoadRequest {
  command: "on-load";
  key: number;
  ids: number[];
  path: string;
  namespace: string;
  suffix: string;
  pluginData: number;
  with: Record<string, string>;
}

export interface OnLoadResponse {
  id?: number;
  pluginName?: string;

  errors?: types.PartialMessage[];
  warnings?: types.PartialMessage[];

  contents?: Uint8Array;
  resolveDir?: string;
  loader?: string;
  pluginData?: number;

  watchFiles?: string[];
  watchDirs?: string[];
}

////////////////////////////////////////////////////////////////////////////////

export interface Packet {
  id: number;
  isRequest: boolean;
  value: Value;
}

export type Value =
  | null
  | boolean
  | number
  | string
  | Uint8Array
  | Value[]
  | { [key: string]: Value };

export function encodePacket(packet: Packet): Uint8Array<ArrayBuffer> {
  const visit = (value: Value) => {
    if (value === null) {
      bb.write8(0);
    } else if (typeof value === "boolean") {
      bb.write8(1);
      bb.write8(+value);
    } else if (typeof value === "number") {
      bb.write8(2);
      bb.write32(value | 0);
    } else if (typeof value === "string") {
      bb.write8(3);
      bb.write(encodeUTF8(value));
    } else if (value instanceof Uint8Array) {
      bb.write8(4);
      bb.write(value);
    } else if (value instanceof Array) {
      bb.write8(5);
      bb.write32(value.length);
      for (const item of value) {
        visit(item);
      }
    } else {
      const keys = Object.keys(value);
      bb.write8(6);
      bb.write32(keys.length);
      for (const key of keys) {
        bb.write(encodeUTF8(key));
        visit(value[key]);
      }
    }
  };

  const bb = new ByteBuffer();
  bb.write32(0); // Reserve space for the length
  bb.write32((packet.id << 1) | +!packet.isRequest);
  visit(packet.value);
  writeUInt32LE(bb.buf, bb.len - 4, 0); // Patch the length in
  return bb.buf.subarray(0, bb.len);
}

export function decodePacket(bytes: Uint8Array<ArrayBuffer>): Packet {
  const visit = (): Value => {
    switch (bb.read8()) {
      case 0: // null
        return null;
      case 1: // boolean
        return !!bb.read8();
      case 2: // number
        return bb.read32();
      case 3: // string
        return decodeUTF8(bb.read());
      case 4: // Uint8Array
        return bb.read();
      case 5: { // Value[]
        const count = bb.read32();
        const value: Value[] = [];
        for (let i = 0; i < count; i++) {
          value.push(visit());
        }
        return value;
      }
      case 6: { // { [key: string]: Value }
        const count = bb.read32();
        const value: { [key: string]: Value } = {};
        for (let i = 0; i < count; i++) {
          value[decodeUTF8(bb.read())] = visit();
        }
        return value;
      }
      default:
        throw new Error("Invalid packet");
    }
  };

  const bb = new ByteBuffer(bytes);
  const id = bb.read32();
  const isRequest = (id & 1) === 0;
  const id2 = id >>> 1;
  const value = visit();
  if (bb.ptr !== bytes.length) {
    throw new Error("Invalid packet");
  }
  return { id: id2, isRequest, value };
}

class ByteBuffer {
  len = 0;
  ptr = 0;

  constructor(public buf = new Uint8Array(1024)) {
  }

  private _write(delta: number): number {
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
    writeUInt32LE(this.buf, value, offset);
  }

  write(bytes: Uint8Array): void {
    const offset = this._write(4 + bytes.length);
    writeUInt32LE(this.buf, bytes.length, offset);
    this.buf.set(bytes, offset + 4);
  }

  private _read(delta: number): number {
    if (this.ptr + delta > this.buf.length) {
      throw new Error("Invalid packet");
    }
    this.ptr += delta;
    return this.ptr - delta;
  }

  read8(): number {
    return this.buf[this._read(1)];
  }

  read32(): number {
    return readUInt32LE(this.buf, this._read(4));
  }

  read(): Uint8Array {
    const length = this.read32();
    const bytes = new Uint8Array(length);
    const ptr = this._read(bytes.length);
    bytes.set(this.buf.subarray(ptr, ptr + length));
    return bytes;
  }
}

export let encodeUTF8: (text: string) => Uint8Array;
export let decodeUTF8: (bytes: Uint8Array) => string;
let encodeInvariant: string;

// Deno always has TextEncoder/TextDecoder
{
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  encodeUTF8 = (text) => encoder.encode(text);
  decodeUTF8 = (bytes) => decoder.decode(bytes);
  encodeInvariant = 'new TextEncoder().encode("")';
}

// Throw an error early if this isn't true. The test framework called "Jest"
// has some bugs regarding this edge case, and letting esbuild proceed further
// leads to confusing errors that make it seem like esbuild itself has a bug.
if (!(encodeUTF8("") instanceof Uint8Array)) {
  throw new Error(
    `Invariant violation: "${encodeInvariant} instanceof Uint8Array" is incorrectly false

This indicates that your JavaScript environment is broken. You cannot use
esbuild in this environment because esbuild relies on this invariant. This
is not a problem with esbuild. You need to fix your environment instead.
`,
  );
}

export function readUInt32LE(buffer: Uint8Array, offset: number): number {
  return (
    buffer[offset++]
    | (buffer[offset++] << 8)
    | (buffer[offset++] << 16)
    | (buffer[offset++] << 24)
  ) >>> 0;
}

function writeUInt32LE(buffer: Uint8Array, value: number, offset: number): void {
  buffer[offset++] = value;
  buffer[offset++] = value >> 8;
  buffer[offset++] = value >> 16;
  buffer[offset++] = value >> 24;
}
