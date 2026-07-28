/**
 * @module
 * Little-endian unsigned 32-bit integer helpers used by the binary stdio
 * codec. The wire format requires fixed-width 32-bit length prefixes and
 * ids, so the host must write/read in little-endian byte order.
 *
 * @see ./packet.ts
 */

/**
 * Reads an unsigned 32-bit little-endian integer from a buffer at the given offset.
 *
 * @param buffer - The `Uint8Array` to read from.
 * @param offset - The byte offset within the buffer (0-based).
 * @returns The unsigned 32-bit integer value at the specified position.
 */
export function readUInt32LE(buffer: Uint8Array, offset: number): number {
  return (
    (
      buffer[offset++]! |
      (buffer[offset++]! << 8) |
      (buffer[offset++]! << 16) |
      (buffer[offset++]! << 24)
    ) >>> 0
  )
}

/** Writes an unsigned 32-bit little-endian integer into `buffer` at `offset`.
 * The high bits beyond 32 are silently dropped to match the wire format. */
export function writeUInt32LE(
  buffer: Uint8Array,
  value: number,
  offset: number,
): void {
  buffer[offset++] = value
  buffer[offset++] = value >> 8
  buffer[offset++] = value >> 16
  buffer[offset++] = value >> 24
}
