/**
 * @module
 * This module implements the binary stdio protocol used to communicate with
 * the esbuild Go binary. It handles encoding/decoding packets, defines all
 * request/response types (BuildRequest, ServeRequest, TransformRequest, etc.),
 * and provides UTF-8 helpers (encodeUTF8/decodeUTF8).
 *
 * The protocol is a simple binary format built on top of JSON with UTF-8 encoding
 * and an additional byte array primitive. Each packet consists of a 4-byte little-endian
 * length prefix followed by the encoded payload.
 *
 * @see encodePacket
 * @see decodePacket
 * @see encodeUTF8
 * @see decodeUTF8
 */

// The JavaScript API communicates with the Go child process over stdin/stdout
// using this protocol. It's a very simple binary protocol that uses primitives
// and nested arrays and maps. It's basically JSON with UTF-8 encoding and an
// additional byte array primitive. You must send a response after receiving a
// request because the other end is blocking on the response coming back.

import type * as types from './types.ts'

/** Request to run a build. */
export interface BuildRequest {
  /** Wire-protocol discriminator. */
  command: 'build'
  /** Build-key registered by the host to scope callback routing. */
  key: number
  /** Resolved entry-point pairs (output, input) in declaration order. */
  entries: [string, string][] // Use an array instead of a map to preserve order
  /** CLI flags string. */
  flags: string[]
  /** Whether the service should write output files to disk. */
  write: boolean
  /** Optional stdin payload when no real entry point exists. */
  stdinContents: Uint8Array | null
  /** Resolve directory for `stdinContents`. */
  stdinResolveDir: string | null
  /** Override for the build's working directory. */
  absWorkingDir: string
  /** Value to set as `NODE_PATH` for the service child. */
  nodePaths: string[]
  /** Whether the build should yield a long-lived `BuildContext`. */
  context: boolean
  /** Plugin tree to register with the service. */
  plugins?: BuildPlugin[]
  /** Mangle cache to seed the service with. */
  mangleCache?: Record<string, string | false>
}

/** Request to start a dev server. */
export interface ServeRequest {
  /** Wire-protocol discriminator. */
  command: 'serve'
  /** Build-key registered by the host to scope callback routing. */
  key: number
  /** Whether the host registered an `onRequest` callback. */
  onRequest: boolean
  /** TCP port to bind to. */
  port?: number
  /** Hostname or IP address to bind to. */
  host?: string
  /** Directory of static files to serve alongside the bundled output. */
  servedir?: string
  /** Path to the TLS private key. */
  keyfile?: string
  /** Path to the TLS certificate. */
  certfile?: string
  /** Fallback HTML path served when the requested path is not found. */
  fallback?: string
  /** Allowed CORS `Origin` values. */
  corsOrigin?: string[]
}

/** Response from a serve request. */
export interface ServeResponse {
  /** TCP port the dev server is bound to. */
  port: number
  /** Hostnames the dev server can be reached on. */
  hosts: string[]
}

/** Plugin registration data embedded in a build request. */
export interface BuildPlugin {
  /** Plugin name shown in messages. */
  name: string
  /** Whether the plugin registered an `onStart` callback. */
  onStart: boolean
  /** Whether the plugin registered an `onEnd` callback. */
  onEnd: boolean
  /** Registered `onResolve` filters, keyed by callback id. */
  onResolve: { id: number; filter: string; namespace: string }[]
  /** Registered `onLoad` filters, keyed by callback id. */
  onLoad: { id: number; filter: string; namespace: string }[]
}

/** Response from a completed build. */
export interface BuildResponse {
  /** Errors surfaced during the build. */
  errors: types.Message[]
  /** Warnings surfaced during the build. */
  warnings: types.Message[]
  /** Output files (only present when `write: false`). */
  outputFiles?: BuildOutputFile[]
  /** Serialized metafile JSON (only present when `metafile: true`). */
  metafile?: Uint8Array
  /** Updated mangle cache to round-trip back to the host. */
  mangleCache?: Record<string, string | false>
  /** Bytes the service wrote to stdout that the host should print. */
  writeToStdout?: Uint8Array
}

/** Request signalling the end of a build (watch/serve). */
export interface OnEndRequest extends BuildResponse {
  /** Wire-protocol discriminator. */
  command: 'on-end'
}

/** Response to an on-end request. */
export interface OnEndResponse {
  /** Errors reported by `onEnd` plugins. */
  errors: types.Message[]
  /** Warnings reported by `onEnd` plugins. */
  warnings: types.Message[]
}

/** A single output file from a build. */
export interface BuildOutputFile {
  /** Absolute path of the generated output file. */
  path: string
  /** Raw bytes of the generated output file. */
  contents: Uint8Array
  /** Content hash for cache-busting query strings. */
  hash: string
}

/** A keep-alive ping. */
export interface PingRequest {
  /** Wire-protocol discriminator. */
  command: 'ping'
}

/** Request to trigger a rebuild. */
export interface RebuildRequest {
  /** Wire-protocol discriminator. */
  command: 'rebuild'
  /** Build-key identifying the context to rebuild. */
  key: number
}

/** Response from a rebuild. */
export interface RebuildResponse {
  /** Errors surfaced during the rebuild. */
  errors: types.Message[]
  /** Warnings surfaced during the rebuild. */
  warnings: types.Message[]
}

/** Request to dispose a build context. */
export interface DisposeRequest {
  /** Wire-protocol discriminator. */
  command: 'dispose'
  /** Build-key identifying the context to dispose. */
  key: number
}

/** Request to cancel an in-flight build. */
export interface CancelRequest {
  /** Wire-protocol discriminator. */
  command: 'cancel'
  /** Build-key identifying the build to cancel. */
  key: number
}

/** Request to start file watching. */
export interface WatchRequest {
  /** Wire-protocol discriminator. */
  command: 'watch'
  /** Build-key identifying the context to watch. */
  key: number
  /** Throttle delay between rebuilds, in milliseconds. */
  delay?: number
}

/** Request for a serve event callback. */
export interface OnServeRequest {
  /** Wire-protocol discriminator. */
  command: 'serve-request'
  /** Build-key identifying the serving context. */
  key: number
  /** Details about the incoming HTTP request. */
  args: types.ServeOnRequestArgs
}

/** Request to run a transform. */
export interface TransformRequest {
  /** Wire-protocol discriminator. */
  command: 'transform'
  /** CLI flags string. */
  flags: string[]
  /** Either the source bytes or a path to a temp file containing them. */
  input: Uint8Array
  /** True when `input` is a path rather than inline bytes. */
  inputFS: boolean
  /** Mangle cache to seed the service with. */
  mangleCache?: Record<string, string | false>
}

/** Response from a transform. */
export interface TransformResponse {
  /** Errors surfaced during the transform. */
  errors: types.Message[]
  /** Warnings surfaced during the transform. */
  warnings: types.Message[]

  /** Transformed source code. */
  code: string
  /** Whether `code` is a path to a file the host should read. */
  codeFS: boolean

  /** Source map string. */
  map: string
  /** Whether `map` is a path to a file the host should read. */
  mapFS: boolean

  /** External file of legal comments, when `legalComments: "external"`. */
  legalComments?: string
  /** Updated mangle cache to round-trip back to the host. */
  mangleCache?: Record<string, string | false>
}

/** Request to format log messages. */
export interface FormatMsgsRequest {
  /** Wire-protocol discriminator. */
  command: 'format-msgs'
  /** Messages to format. */
  messages: types.Message[]
  /** `true` when the messages are warnings rather than errors. */
  isWarning: boolean
  /** Whether to emit ANSI color escapes. */
  color?: boolean
  /** Width used for line wrapping. */
  terminalWidth?: number
}

/** Response with formatted message strings. */
export interface FormatMsgsResponse {
  /** One formatted string per input message, in the same order. */
  messages: string[]
}

/** Request to analyze a metafile. */
export interface AnalyzeMetafileRequest {
  /** Wire-protocol discriminator. */
  command: 'analyze-metafile'
  /** Metafile JSON to analyze. */
  metafile: string
  /** Whether to emit ANSI color escapes. */
  color?: boolean
  /** Whether to include every input in the analysis output. */
  verbose?: boolean
}

/** Response with the analysis result string. */
export interface AnalyzeMetafileResponse {
  /** Pretty-printed analysis (or empty when the service has nothing to add). */
  result: string
}

/** Request for a plugin onStart callback. */
export interface OnStartRequest {
  /** Wire-protocol discriminator. */
  command: 'on-start'
  /** Build-key identifying the build receiving the callback. */
  key: number
}

/** Response to an on-start request. */
export interface OnStartResponse {
  /** Errors collected from `onStart` callbacks. */
  errors?: types.PartialMessage[]
  /** Warnings collected from `onStart` callbacks. */
  warnings?: types.PartialMessage[]
}

/** Request to resolve a module path. */
export interface ResolveRequest {
  /** Wire-protocol discriminator. */
  command: 'resolve'
  /** Build-key identifying the build receiving the resolve. */
  key: number
  /** Path to resolve. */
  path: string
  /** Name of the plugin initiating the resolve. */
  pluginName: string
  /** Importer path used as the relative base. */
  importer?: string
  /** Loader namespace to resolve inside. */
  namespace?: string
  /** Directory used to resolve relative paths. */
  resolveDir?: string
  /** Kind of import that triggered the resolve. */
  kind?: string
  /** Lookup id for `pluginData` in the host's object stash. */
  pluginData?: number
  /** Import attributes (e.g. `{ type: "json" }`). */
  with?: Record<string, string>
}

/** Response with resolved module info. */
export interface ResolveResponse {
  /** Errors surfaced during the resolve. */
  errors: types.Message[]
  /** Warnings surfaced during the resolve. */
  warnings: types.Message[]

  /** Resolved path. */
  path: string
  /** Whether the resolved path should be treated as external. */
  external: boolean
  /** Whether the module has side effects (used for tree shaking). */
  sideEffects: boolean
  /** Loader namespace the resolved path belongs to. */
  namespace: string
  /** Suffix appended to the resolved path (e.g. `?query`). */
  suffix: string
  /** Lookup id for the outgoing `pluginData` in the host's object stash. */
  pluginData: number
}

/** Request for a plugin onResolve callback. */
export interface OnResolveRequest {
  /** Wire-protocol discriminator. */
  command: 'on-resolve'
  /** Build-key identifying the build receiving the callback. */
  key: number
  /** Candidate callback ids to try in order. */
  ids: number[]
  /** Import path the resolve callback was triggered for. */
  path: string
  /** Importer path that issued the import. */
  importer: string
  /** Loader namespace the import originated from. */
  namespace: string
  /** Directory used to resolve relative paths. */
  resolveDir: string
  /** Kind of import that triggered the resolve call. */
  kind: types.ImportKind
  /** Lookup id for `pluginData` in the host's object stash. */
  pluginData: number
  /** Import attributes (e.g. `{ type: "json" }`). */
  with: Record<string, string>
}

/** Response to an on-resolve request. */
export interface OnResolveResponse {
  /** Id of the callback that handled the request. */
  id?: number
  /** Name of the plugin claiming the resolved path. */
  pluginName?: string

  /** Errors surfaced during the plugin's resolve. */
  errors?: types.PartialMessage[]
  /** Warnings surfaced during the plugin's resolve. */
  warnings?: types.PartialMessage[]

  /** Resolved path produced by the plugin. */
  path?: string
  /** Whether the resolved path should be treated as external. */
  external?: boolean
  /** Whether the module has side effects (used for tree shaking). */
  sideEffects?: boolean
  /** Loader namespace the resolved path belongs to. */
  namespace?: string
  /** Suffix appended to the resolved path (e.g. `?query`). */
  suffix?: string
  /** Lookup id for the outgoing `pluginData` in the host's object stash. */
  pluginData?: number

  /** Additional files to watch alongside the build. */
  watchFiles?: string[]
  /** Additional directories to watch alongside the build. */
  watchDirs?: string[]
}

/** Request for a plugin onLoad callback. */
export interface OnLoadRequest {
  /** Wire-protocol discriminator. */
  command: 'on-load'
  /** Build-key identifying the build receiving the callback. */
  key: number
  /** Candidate callback ids to try in order. */
  ids: number[]
  /** Path the load callback was triggered for. */
  path: string
  /** Loader namespace the path belongs to. */
  namespace: string
  /** Suffix appended to the path (e.g. `?query`). */
  suffix: string
  /** Lookup id for `pluginData` in the host's object stash. */
  pluginData: number
  /** Import attributes (e.g. `{ type: "json" }`). */
  with: Record<string, string>
}

/** Response to an on-load request. */
export interface OnLoadResponse {
  /** Id of the callback that handled the request. */
  id?: number
  /** Name of the plugin claiming the loaded content. */
  pluginName?: string

  /** Errors surfaced during the plugin's load. */
  errors?: types.PartialMessage[]
  /** Warnings surfaced during the plugin's load. */
  warnings?: types.PartialMessage[]

  /** Module contents to feed back into esbuild. */
  contents?: Uint8Array
  /** Directory used to resolve relative paths inside `contents`. */
  resolveDir?: string
  /** Loader used to interpret `contents`. */
  loader?: string
  /** Lookup id for the outgoing `pluginData` in the host's object stash. */
  pluginData?: number

  /** Additional files to watch alongside the build. */
  watchFiles?: string[]
  /** Additional directories to watch alongside the build. */
  watchDirs?: string[]
}

////////////////////////////////////////////////////////////////////////////////

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

/**
 * Reads an unsigned 32-bit little-endian integer from a buffer at the given offset.
 *
 * @param buffer - The `Uint8Array` to read from.
 * @param offset - The byte offset within the buffer (0-based).
 * @returns The unsigned 32-bit integer value at the specified position.
 */
export function readUInt32LE(buffer: Uint8Array, offset: number): number {
  return (
    buffer[offset++]! |
    (buffer[offset++]! << 8) |
    (buffer[offset++]! << 16) |
    (buffer[offset++]! << 24)
  ) >>> 0
}

function writeUInt32LE(
  buffer: Uint8Array,
  value: number,
  offset: number,
): void {
  buffer[offset++] = value
  buffer[offset++] = value >> 8
  buffer[offset++] = value >> 16
  buffer[offset++] = value >> 24
}
