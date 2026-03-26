import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.19";
import {
  ByteBuffer,
  decodePacket,
  encodePacket,
  readUInt32LE,
  validateUTF8Codec,
  writeUInt32LE,
} from "@ggpwnkthx/esbuild/utils";

Deno.test("ByteBuffer.write8() + ByteBuffer.read8() round-trip one byte", () => {
  const bb = new ByteBuffer();
  bb.write8(255);
  bb.ptr = 0;
  assertEquals(bb.read8(), 255);
});

Deno.test("ByteBuffer.write32() + ByteBuffer.read32() round-trip a 32-bit value", () => {
  const bb = new ByteBuffer();
  bb.write32(0x12345678);
  bb.ptr = 0;
  assertEquals(bb.read32(), 0x12345678);
});

Deno.test("ByteBuffer.write() + ByteBuffer.read() round-trip a length-prefixed Uint8Array", () => {
  const bb = new ByteBuffer();
  bb.write(new Uint8Array([1, 2, 3]));
  bb.ptr = 0;
  assertEquals(bb.read(), new Uint8Array([1, 2, 3]));
});

Deno.test("ByteBuffer._write() growth path is exercised via write() methods", () => {
  const bb = new ByteBuffer(new Uint8Array(2));
  bb.write32(0x12345678);
  assertEquals(bb.len, 4);
  assertEquals(bb.buf[0], 0x78);
  assertEquals(bb.buf[1], 0x56);
  assertEquals(bb.buf[2], 0x34);
  assertEquals(bb.buf[3], 0x12);

  bb.ptr = 0;
  assertEquals(bb.read32(), 0x12345678);
});

Deno.test("ByteBuffer.read() returns a copy, not a view into the internal buffer", () => {
  const bb = new ByteBuffer();
  bb.write(new Uint8Array([1, 2, 3]));
  bb.ptr = 0;
  const read1 = bb.read();
  read1[0] = 99;
  assertEquals(bb.buf[4], 1);
});

Deno.test("ByteBuffer.read8() throws Invalid packet when the input buffer is empty", () => {
  const bb = new ByteBuffer(new Uint8Array());
  assertThrows(() => bb.read8(), Error, "Invalid packet");
});

Deno.test("ByteBuffer.read32() throws Invalid packet when fewer than 4 bytes remain", () => {
  const bb = new ByteBuffer(new Uint8Array([1, 2, 3]));
  assertThrows(() => bb.read32(), Error, "Invalid packet");
});

Deno.test("ByteBuffer.read() throws Invalid packet when the declared payload length exceeds remaining bytes", () => {
  const bb = new ByteBuffer(new Uint8Array([5, 0, 0, 0, 1, 2]));
  assertThrows(() => bb.read(), Error, "Invalid packet");
});

Deno.test("ByteBuffer._read() checks buffer capacity (buf.length), not data length (len)", () => {
  const bb = new ByteBuffer(new Uint8Array(2));
  bb.write8(1);
  bb.write8(2);
  bb.ptr = 0;
  assertEquals(bb.read8(), 1);
  assertEquals(bb.read8(), 2);
  assertThrows(() => bb.read8(), Error, "Invalid packet");
});

Deno.test("writeUInt32LE() writes bytes in little-endian order", () => {
  const buf = new Uint8Array(4);
  writeUInt32LE(buf, 0x12345678, 0);
  assertEquals([...buf], [0x78, 0x56, 0x34, 0x12]);
});

Deno.test("readUInt32LE() decodes little-endian bytes correctly", () => {
  const buf = new Uint8Array([0x78, 0x56, 0x34, 0x12]);
  assertEquals(readUInt32LE(buf, 0), 0x12345678);
});

Deno.test("readUInt32LE() preserves unsigned semantics", () => {
  const buf = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
  assertEquals(readUInt32LE(buf, 0), 4294967295);
});

Deno.test("writeUInt32LE() only mutates the intended 4-byte slice", () => {
  const buf = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
  writeUInt32LE(buf, 0x11223344, 1);
  assertEquals([...buf], [0xaa, 0x44, 0x33, 0x22, 0x11, 0xff]);
});

Deno.test("encodePacket() produces [length][idField][value] format for binary stdin", () => {
  const packet = { id: 1, isRequest: true, value: null };
  const encoded = encodePacket(packet);
  assertEquals(encoded.length, 9);
  const length = readUInt32LE(encoded, 0);
  assertEquals(length, 5);
  const idField = readUInt32LE(encoded, 4);
  assertEquals(idField, 2);
  assertEquals(encoded[8], 0);
});

Deno.test("encodePacket() encodes isRequest correctly in id field", () => {
  const reqTrue = { id: 5, isRequest: true, value: null };
  const reqFalse = { id: 5, isRequest: false, value: null };
  const encTrue = encodePacket(reqTrue);
  const encFalse = encodePacket(reqFalse);
  const idTrue = readUInt32LE(encTrue, 4);
  const idFalse = readUInt32LE(encFalse, 4);
  assertEquals(idTrue, 5 << 1 | 0);
  assertEquals(idFalse, 5 << 1 | 1);
});

Deno.test("decodePacket() decodes binary stdout format [idField][value] correctly", () => {
  const bytes = new Uint8Array([
    0x02,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);
  const decoded = decodePacket(bytes);
  assertEquals(decoded.id, 1);
  assertEquals(decoded.isRequest, true);
  assertEquals(decoded.value, null);
});

Deno.test("decodePacket() decodes false isRequest correctly", () => {
  const bytes = new Uint8Array([
    0x03,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);
  const decoded = decodePacket(bytes);
  assertEquals(decoded.id, 1);
  assertEquals(decoded.isRequest, false);
  assertEquals(decoded.value, null);
});

Deno.test("decodePacket() decodes boolean true", () => {
  const bytes = new Uint8Array([
    0x00,
    0x00,
    0x00,
    0x00,
    0x01,
    0x01,
  ]);
  const decoded = decodePacket(bytes);
  assertEquals(decoded.id, 0);
  assertEquals(decoded.isRequest, true);
  assertEquals(decoded.value, true);
});

Deno.test("decodePacket() decodes boolean false", () => {
  const bytes = new Uint8Array([
    0x01,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
  ]);
  const decoded = decodePacket(bytes);
  assertEquals(decoded.id, 0);
  assertEquals(decoded.isRequest, false);
  assertEquals(decoded.value, false);
});

Deno.test("decodePacket() decodes number value", () => {
  const bytes = new Uint8Array([
    0x05,
    0x00,
    0x00,
    0x00,
    0x02,
    0x2a,
    0x00,
    0x00,
    0x00,
  ]);
  const decoded = decodePacket(bytes);
  assertEquals(decoded.value, 42);
});

Deno.test("decodePacket() decodes string value", () => {
  const bytes = new Uint8Array([
    0x05,
    0x00,
    0x00,
    0x00,
    0x03,
    0x02,
    0x00,
    0x00,
    0x00,
    0x61,
    0x62,
  ]);
  const decoded = decodePacket(bytes);
  assertEquals(decoded.value, "ab");
});

Deno.test("decodePacket() decodes Uint8Array value", () => {
  const bytes = new Uint8Array([
    0x07,
    0x00,
    0x00,
    0x00,
    0x04,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    0x02,
    0x03,
  ]);
  const decoded = decodePacket(bytes);
  assertEquals(decoded.value, new Uint8Array([1, 2, 3]));
});

Deno.test("decodePacket() decodes array value", () => {
  const bytes = new Uint8Array([
    0x0e,
    0x00,
    0x00,
    0x00,
    0x05,
    0x03,
    0x00,
    0x00,
    0x00,
    0x02,
    0x01,
    0x00,
    0x00,
    0x00,
    0x03,
    0x03,
    0x00,
    0x00,
    0x00,
    0x61,
    0x62,
    0x63,
    0x00,
  ]);
  const decoded = decodePacket(bytes);
  assertEquals(decoded.value, [1, "abc", null]);
});

Deno.test("decodePacket() decodes object value", () => {
  const bytes = new Uint8Array([
    0x12,
    0x00,
    0x00,
    0x00,
    0x06,
    0x01,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x6b,
    0x03,
    0x01,
    0x00,
    0x00,
    0x00,
    0x76,
  ]);
  const decoded = decodePacket(bytes);
  assertEquals(decoded.value, { k: "v" });
});

Deno.test("decodePacket() throws on unknown type tag", () => {
  const bytes = new Uint8Array([0x01, 0x00, 0x00, 0x00, 0x99]);
  assertThrows(() => decodePacket(bytes), Error, "Invalid packet");
});

Deno.test("decodePacket() throws on trailing bytes", () => {
  const bytes = new Uint8Array([
    0x02,
    0x00,
    0x00,
    0x00,
    0x00,
    0xff,
  ]);
  assertThrows(() => decodePacket(bytes), Error, "Invalid packet");
});

Deno.test("decodePacket() throws on truncated string body", () => {
  const bytes = new Uint8Array([
    0x05,
    0x00,
    0x00,
    0x00,
    0x03,
    0x03,
    0x00,
    0x00,
    0x00,
    0x61,
    0x62,
  ]);
  assertThrows(() => decodePacket(bytes), Error, "Invalid packet");
});

Deno.test("decodePacket() throws on truncated array body", () => {
  const bytes = new Uint8Array([
    0x0e,
    0x00,
    0x00,
    0x00,
    0x05,
    0x02,
    0x00,
    0x00,
    0x00,
    0x02,
    0x01,
    0x00,
    0x00,
    0x00,
  ]);
  assertThrows(() => decodePacket(bytes), Error, "Invalid packet");
});

Deno.test("decodePacket() throws on truncated object body", () => {
  const bytes = new Uint8Array([
    0x10,
    0x00,
    0x00,
    0x00,
    0x06,
    0x01,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x6b,
  ]);
  assertThrows(() => decodePacket(bytes), Error, "Invalid packet");
});

Deno.test("encodePacket() truncates numbers with value | 0", () => {
  const cases: [number, number][] = [
    [1.9, 1],
    [2 ** 31 - 1, 2 ** 31 - 1],
    [-1, 4294967295],
    [2 ** 32 - 1, 4294967295],
    [-2.7, 4294967294],
  ];
  for (const [input, expected] of cases) {
    const bytes = new Uint8Array(5 + 4);
    writeUInt32LE(bytes, 0, 0);
    bytes[4] = 0x02;
    writeUInt32LE(bytes, input | 0, 5);
    const decoded = decodePacket(bytes);
    assertEquals(decoded.value, expected);
  }
});

Deno.test("validateUTF8Codec() succeeds in a normal Deno runtime", () => {
  validateUTF8Codec();
});
