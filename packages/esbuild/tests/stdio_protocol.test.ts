import { assertEquals, assertThrows } from '@std/assert'
import {
  decodePacket,
  decodeUTF8,
  encodePacket,
  encodeUTF8,
  type Packet,
  readUInt32LE,
  type Value,
} from '../shared/stdio_protocol/mod.ts'

Deno.test('UTF-8: encode/decode round-trip for ASCII', () => {
  const out = decodeUTF8(encodeUTF8('hello world'))
  assertEquals(out, 'hello world')
})

Deno.test('UTF-8: encode/decode round-trip for multi-byte characters', () => {
  // BMP character (2 bytes), supplementary plane (4 bytes),
  // and emoji ZWJ sequence (long) all share the same path.
  const samples = ['café', '日本語', '🐉', '👨‍👩‍👧‍👦', 'Ω∑œæþ']
  for (const s of samples) {
    assertEquals(decodeUTF8(encodeUTF8(s)), s)
  }
})

Deno.test('UTF-8: encode always returns a Uint8Array (transport invariant)', () => {
  // The transport declares an invariant at module load: the encoder must
  // produce a Uint8Array. If a runtime substitute ever returns a Buffer or
  // string, this assertion fires.
  assertEquals(encodeUTF8('') instanceof Uint8Array, true)
})

Deno.test('readUInt32LE: reads little-endian uint32 values', () => {
  const buf = new Uint8Array([0x78, 0x56, 0x34, 0x12, 0xff, 0xff, 0xff, 0xff])
  assertEquals(readUInt32LE(buf, 0), 0x12345678)
  // 0xffffffff must read back as a positive uint32, not a negative int32.
  assertEquals(readUInt32LE(buf, 4), 0xffffffff)
})

function roundTrip(packet: Packet): Packet {
  // `encodePacket` prepends a 4-byte LE length prefix; the transport strips
  // it before handing the packet to `decodePacket` (see transport.ts
  // handleIncomingPacket), so we mirror that here.
  const encoded = encodePacket(packet)
  return decodePacket(encoded.subarray(4))
}

const SAMPLE_PRIMITIVES: Array<[string, Value]> = [
  ['null', null],
  ['boolean true', true],
  ['boolean false', false],
  ['integer 0', 0],
  ['integer 0x7fffffff', 0x7fffffff],
  [
    'integer 0x80000000 (msb set; positive 32-bit)',
    0x80000000,
  ],
  ['empty string', ''],
  ['ASCII string', 'hello'],
  ['UTF-8 string', 'café 🐉'],
]

for (const [label, value] of SAMPLE_PRIMITIVES) {
  Deno.test(`packet: round-trip ${label}`, () => {
    const out = roundTrip({ id: 7, isRequest: true, value })
    assertEquals(out, { id: 7, isRequest: true, value })
  })
}

Deno.test('packet: integers encode as unsigned 32-bit (wire-format constraint)', () => {
  // Wire protocol: `encodePacket` uses `value | 0`, `decodePacket` returns the
  // raw 32-bit value with `>>> 0`. As a result, -1 cannot round-trip on this
  // wire — it becomes 0xffffffff (4294967295). Documented here so future
  // contributors don't try to "fix" the mismatch.
  const out = roundTrip({ id: 0, isRequest: true, value: -1 })
  assertEquals(out.value, 4294967295)
  // Verify the round-trip from the canonical 0xffffffff representation.
  const out2 = roundTrip({ id: 0, isRequest: true, value: 4294967295 })
  assertEquals(out2.value, 4294967295)
})

Deno.test('packet: round-trip Uint8Array payload preserves byte-for-byte contents', () => {
  const original = new Uint8Array([0x00, 0x01, 0xfe, 0xff, 0x7f])
  const out = roundTrip({ id: 0, isRequest: true, value: original })
  const decoded = out.value as Uint8Array
  assertEquals(decoded instanceof Uint8Array, true)
  assertEquals(decoded.length, original.length)
  for (let i = 0; i < original.length; i++) {
    assertEquals(decoded[i], original[i]!)
  }
})

Deno.test('packet: round-trip empty array and empty object', () => {
  const a = roundTrip({ id: 0, isRequest: true, value: [] })
  assertEquals(a, { id: 0, isRequest: true, value: [] })

  const b = roundTrip({ id: 0, isRequest: true, value: {} })
  assertEquals(b, { id: 0, isRequest: true, value: {} })
})

Deno.test('packet: round-trip nested arrays preserve order and contents', () => {
  const value: Value = [1, 'a', [2, 'b'], null, [3, [4, [5]]]]
  const out = roundTrip({ id: 0, isRequest: true, value })
  assertEquals(out, { id: 0, isRequest: true, value })
})

Deno.test('packet: round-trip nested objects preserve key order is irrelevant, contents are checked', () => {
  const value: Value = { a: 1, b: 'x', c: { d: 2, e: [1, 2, 3] } }
  const out = roundTrip({ id: 0, isRequest: true, value })
  assertEquals(out, { id: 0, isRequest: true, value })
})

Deno.test('packet: round-trip a heterogeneous top-level array of every kind', () => {
  const value: Value = [
    null,
    true,
    false,
    1,
    's',
    new Uint8Array([9, 8, 7]),
    [1, 2],
    { k: 'v' },
  ]
  const out = roundTrip({ id: 99, isRequest: false, value })
  assertEquals(out.isRequest, false)
  assertEquals(out.id, 99)
  // Bytes are equal but distinct objects; check by value.
  const decodedArr = out.value as Value[]
  assertEquals(decodedArr.length, 8)
  assertEquals(decodedArr[6] as number[], [1, 2])
  assertEquals((decodedArr[7] as Record<string, Value>)['k'], 'v')
})

Deno.test('packet: id encoding is `id << 1 | (!isRequest) bit`', () => {
  const requestBytes = encodePacket({ id: 5, isRequest: true, value: null })
  const responseBytes = encodePacket({ id: 5, isRequest: false, value: null })
  // Both packets start with a 4-byte length prefix followed by the id word.
  // The id word is little-endian, so the low byte is (id << 1) | 0 or 1.
  const requestLowByte = requestBytes[4]!
  const responseLowByte = responseBytes[4]!
  assertEquals(requestLowByte, (5 << 1) | 0)
  assertEquals(responseLowByte, (5 << 1) | 1)
})

Deno.test('packet: encoded buffer prefix carries the payload length', () => {
  const bytes = encodePacket({ id: 1, isRequest: true, value: 'a' })
  // First 4 bytes: LE uint32 = payload length minus those 4 bytes.
  const len = readUInt32LE(bytes, 0)
  assertEquals(len, bytes.length - 4)
})

Deno.test('packet: throws on a malformed packet (invalid tag byte)', () => {
  // 0x07 is not a valid tag in the encoder's tag set.
  const malformed = new Uint8Array([
    // length prefix ignored by decode; encode a single byte packet by hand
    0x07,
    0x00,
    0x00,
    0x00, // len = 1
    0x07, // invalid tag
  ])
  assertThrows(() => decodePacket(malformed), Error, 'Invalid packet')
})

Deno.test('packet: throws on trailing bytes after a complete payload', () => {
  const inner = encodePacket({ id: 0, isRequest: true, value: 1 })
  const padded = new Uint8Array(inner.length + 1)
  padded.set(inner)
  padded[inner.length] = 0x42
  assertThrows(() => decodePacket(padded), Error, 'Invalid packet')
})

Deno.test('packet: throws when the buffer is truncated mid-payload', () => {
  const inner = encodePacket({ id: 0, isRequest: true, value: 'hello world' })
  const truncated = inner.subarray(0, inner.length - 1)
  assertThrows(() => decodePacket(truncated), Error)
})

Deno.test('packet: round-trip unicode keys in nested objects', () => {
  const value: Value = { 'café': 1, '日本語': 'x', '🔑': true }
  const out = roundTrip({ id: 0, isRequest: true, value })
  assertEquals(out, { id: 0, isRequest: true, value })
})

Deno.test('packet: large Uint8Array round-trips verbatim (within MAX_PACKET_BYTES)', () => {
  // 1 MiB payload. The transport's MAX_PACKET_BYTES cap is 64 MiB.
  const big = new Uint8Array(1024 * 1024)
  for (let i = 0; i < big.length; i++) big[i] = i & 0xff
  const out = roundTrip({ id: 0, isRequest: true, value: big })
  const decoded = out.value as Uint8Array
  assertEquals(decoded.length, big.length)
  for (let i = 0; i < big.length; i += 4096) {
    assertEquals(decoded[i], i & 0xff)
  }
})
