/**
 * A growable byte buffer for reading and writing binary data in little-endian
 * format. Used for encoding and decoding packets in the esbuild protocol.
 */
export class ByteBuffer {
  buf: Uint8Array;
  len: number;
  ptr: number;

  constructor(buf: Uint8Array = new Uint8Array(1024)) {
    this.buf = buf;
    this.len = 0;
    this.ptr = 0;
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

/**
 * Reads an unsigned 32-bit integer from a buffer in little-endian format.
 */
export function readUInt32LE(buffer: Uint8Array, offset: number): number {
  return (
    (buffer[offset++]
      | (buffer[offset++] << 8)
      | (buffer[offset++] << 16)
      | (buffer[offset++] << 24))
    >>> 0
  );
}

/**
 * Writes an unsigned 32-bit integer to a buffer in little-endian format.
 */
export function writeUInt32LE(buffer: Uint8Array, value: number, offset: number): void {
  buffer[offset++] = value;
  buffer[offset++] = value >> 8;
  buffer[offset++] = value >> 16;
  buffer[offset++] = value >> 24;
}

interface Packet {
  id: number;
  isRequest: boolean;
  value: unknown;
}

/**
 * Encodes a packet (request or response) into a byte array for transmission
 * to the esbuild service.
 */
export function encodePacket(packet: Packet): Uint8Array {
  const encodeUTF8 = getEncodeUTF8();

  const visit = (value: unknown): void => {
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
    } else if (Array.isArray(value)) {
      bb.write8(5);
      bb.write32(value.length);
      for (const item of value) {
        visit(item);
      }
    } else {
      const keys = Object.keys(value as Record<string, unknown>);
      bb.write8(6);
      bb.write32(keys.length);
      for (const key of keys) {
        bb.write(encodeUTF8(key));
        visit((value as Record<string, unknown>)[key]);
      }
    }
  };

  const bb = new ByteBuffer();
  bb.write32(0);
  bb.write32(packet.id << 1 | +!packet.isRequest);
  visit(packet.value);
  writeUInt32LE(bb.buf as Uint8Array, bb.len - 4, 0);
  return bb.buf.subarray(0, bb.len) as Uint8Array;
}

/**
 * Decodes a packet from a byte array received from the esbuild service.
 */
export function decodePacket(bytes: Uint8Array): Packet {
  const decodeUTF8 = getDecodeUTF8();

  const visit = (): unknown => {
    switch (bb.read8()) {
      case 0:
        return null;
      case 1:
        return !!bb.read8();
      case 2:
        return bb.read32();
      case 3:
        return decodeUTF8(bb.read());
      case 4:
        return bb.read();
      case 5: {
        const count = bb.read32();
        const value: unknown[] = [];
        for (let i = 0; i < count; i++) {
          value.push(visit());
        }
        return value;
      }
      case 6: {
        const count = bb.read32();
        const value: Record<string, unknown> = {};
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
  let id = bb.read32();
  const isRequest = (id & 1) === 0;
  id >>>= 1;
  const value = visit();
  if (bb.ptr !== bytes.length) {
    throw new Error("Invalid packet");
  }
  return { id, isRequest, value };
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function getEncodeUTF8(): (text: string) => Uint8Array {
  return (text: string) => textEncoder.encode(text);
}

function getDecodeUTF8(): (bytes: Uint8Array) => string {
  return (bytes: Uint8Array) => textDecoder.decode(bytes);
}

/**
 * Validates that the TextEncoder/TextDecoder codec produces valid UTF-8.
 * Throws an error if the JavaScript environment is broken.
 */
export function validateUTF8Codec(): void {
  const encodeUTF8 = getEncodeUTF8();
  if (!(encodeUTF8("") instanceof Uint8Array)) {
    throw new Error(
      `Invariant violation: "new TextEncoder().encode(\"\") instanceof Uint8Array" is incorrectly false

This indicates that your JavaScript environment is broken. You cannot use
esbuild in this environment because esbuild relies on this invariant. This
is not a problem with esbuild. You need to fix your environment instead.
`,
    );
  }
}
