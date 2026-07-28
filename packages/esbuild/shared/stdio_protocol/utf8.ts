/**
 * @module
 * UTF-8 helpers and the TextEncoder/TextDecoder invariant guard used by the
 * binary stdio codec.
 *
 * @see ./packet.ts
 */

/** Encodes a string to UTF-8 bytes using TextEncoder. */
export let encodeUTF8: (text: string) => Uint8Array
/** Decodes UTF-8 bytes to a string using TextDecoder. */
export let decodeUTF8: (bytes: Uint8Array) => string
let encodeInvariant: string

// Deno always has TextEncoder/TextDecoder
{
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  encodeUTF8 = (text) => encoder.encode(text)
  decodeUTF8 = (bytes) => decoder.decode(bytes)
  encodeInvariant = 'new TextEncoder().encode("")'
}

// Throw an error early if this isn't true. The test framework called "Jest"
// has some bugs regarding this edge case, and letting esbuild proceed further
// leads to confusing errors that make it seem like esbuild itself has a bug.
if (!(encodeUTF8('') instanceof Uint8Array)) {
  throw new Error(
    `Invariant violation: "${encodeInvariant} instanceof Uint8Array" is incorrectly false

This indicates that your JavaScript environment is broken. You cannot use
esbuild in this environment because esbuild relies on this invariant. This
is not a problem with esbuild. You need to fix your environment instead.
`,
  )
}
