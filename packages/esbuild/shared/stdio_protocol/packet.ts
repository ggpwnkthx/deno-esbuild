/**
 * @module
 * Packet envelope (`Packet`, `Value`) and the binary codec that turns a
 * `Packet` into the bytes that travel over stdio and back.
 *
 * The protocol is a simple binary format built on top of JSON with UTF-8
 * encoding and an additional byte-array primitive. Each packet consists of a
 * 4-byte little-endian length prefix followed by the encoded payload.
 *
 * @see ./messages.ts
 * @see ./utf8.ts
 * @see ./le.ts
 */
import { decodeUTF8, encodeUTF8 } from './utf8.ts'
import { readUInt32LE, writeUInt32LE } from './le.ts'

/** A single binary packet (request or response) on the stdio channel. */
export interface Packet {
  /** Per-channel message id, doubled + bit-flipped to encode the request
   * direction in the low bit. */
  id: number
  /** `true` for service-bound requests, `false` for host-bound responses. */
  isRequest: boolean
  /** Payload payload (see {@link Value}). */
  value: Value
}

/** The protocol's union type for all serializable values. */
export type Value =
  | null
  | boolean
  | number
  | string
  | Uint8Array
  | Value[]
  | { [key: string]: Value }

/**
 * Encodes a {@link Packet} into a byte array for transmission over the stdio channel.
 *
 * @param packet - The packet to encode, including `id`, `isRequest` flag, and `value`.
 * @returns A `Uint8Array` containing the encoded packet (length prefix + payload).
 * @see Packet
 * @see decodePacket
 */
export function encodePacket(packet: Packet): Uint8Array {
  const visit = (value: Value) => {
    if (value === null) {
      bb.write8(0)
    } else if (typeof value === 'boolean') {
      bb.write8(1)
      bb.write8(+value)
    } else if (typeof value === 'number') {
      bb.write8(2)
      bb.write32(value | 0)
    } else if (typeof value === 'string') {
      bb.write8(3)
      bb.write(encodeUTF8(value))
    } else if (value instanceof Uint8Array) {
      bb.write8(4)
      bb.write(value)
    } else if (value instanceof Array) {
      bb.write8(5)
      bb.write32(value.length)
      for (const item of value) {
        visit(item)
      }
    } else {
      const keys = Object.keys(value)
      bb.write8(6)
      bb.write32(keys.length)
      for (const key of keys) {
        bb.write(encodeUTF8(key))
        visit(value[key]!)
      }
    }
  }

  const bb = new ByteBuffer()
  bb.write32(0) // Reserve space for the length
  bb.write32((packet.id << 1) | +!packet.isRequest)
  visit(packet.value)
  writeUInt32LE(bb.buf, bb.len - 4, 0) // Patch the length in
  return bb.buf.subarray(0, bb.len)
}

/**
 * Decodes a byte array from the stdio channel into a {@link Packet}.
 *
 * @param bytes - A `Uint8Array` containing the encoded packet (length prefix + payload).
 * @returns The decoded `Packet` object.
 * @throws {Error} If the packet is malformed or the byte stream is truncated.
 * @see Packet
 * @see encodePacket
 */
export function decodePacket(bytes: Uint8Array): Packet {
  const visit = (): Value => {
    switch (bb.read8()) {
      case 0: // null
        return null
      case 1: // boolean
        return !!bb.read8()
      case 2: // number
        return bb.read32()
      case 3: // string
        return decodeUTF8(bb.read())
      case 4: // Uint8Array
        return bb.read()
      case 5: { // Value[]
        const count = bb.read32()
        const value: Value[] = []
        for (let i = 0; i < count; i++) {
          value.push(visit())
        }
        return value
      }
      case 6: { // { [key: string]: Value }
        const count = bb.read32()
        const value: { [key: string]: Value } = {}
        for (let i = 0; i < count; i++) {
          value[decodeUTF8(bb.read())] = visit()
        }
        return value
      }
      default:
        throw new Error('Invalid packet')
    }
  }

  const bb = new ByteBuffer(bytes)
  const id = bb.read32()
  const isRequest = (id & 1) === 0
  const id2 = id >>> 1
  const value = visit()
  if (bb.ptr !== bytes.length) {
    throw new Error('Invalid packet')
  }
  return { id: id2, isRequest, value }
}

class ByteBuffer {
  len = 0
  ptr = 0

  constructor(public buf: Uint8Array = new Uint8Array(1024)) {
  }

  private _write(delta: number): number {
    if (this.len + delta > this.buf.length) {
      const clone = new Uint8Array((this.len + delta) * 2)
      clone.set(this.buf)
      this.buf = clone
    }
    this.len += delta
    return this.len - delta
  }

  write8(value: number): void {
    const offset = this._write(1)
    this.buf[offset] = value
  }

  write32(value: number): void {
    const offset = this._write(4)
    writeUInt32LE(this.buf, value, offset)
  }

  write(bytes: Uint8Array): void {
    const offset = this._write(4 + bytes.length)
    writeUInt32LE(this.buf, bytes.length, offset)
    this.buf.set(bytes, offset + 4)
  }

  private _read(delta: number): number {
    if (this.ptr + delta > this.buf.length) {
      throw new Error('Invalid packet')
    }
    this.ptr += delta
    return this.ptr - delta
  }

  read8(): number {
    return this.buf[this._read(1)]!
  }

  read32(): number {
    return readUInt32LE(this.buf, this._read(4))
  }

  read(): Uint8Array {
    const length = this.read32()
    const bytes = new Uint8Array(length)
    const ptr = this._read(bytes.length)
    bytes.set(this.buf.subarray(ptr, ptr + length))
    return bytes
  }
}
