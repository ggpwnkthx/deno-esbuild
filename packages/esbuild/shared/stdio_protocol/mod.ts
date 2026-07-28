/**
 * @module
 * Binary stdio protocol used to communicate with the esbuild Go service.
 *
 * The implementation is split across the sibling modules in this directory:
 * - {@link ./messages.ts} — request/response DTOs.
 * - {@link ./formatter_messages.ts} — `format-msgs` and `analyze-metafile`
 *   DTOs.
 * - {@link ./plugin_messages.ts} — `on-start`, `on-resolve`, `on-load`,
 *   `serve-request` DTOs, plus the host-bound `ResolveRequest` /
 *   `ResolveResponse`.
 * - {@link ./packet.ts} — `Packet`, `Value`, `encodePacket`, `decodePacket`,
 *   and the internal `ByteBuffer`.
 * - {@link ./utf8.ts} — `encodeUTF8`/`decodeUTF8` and the
 *   `TextEncoder`/`TextDecoder` invariant guard.
 * - {@link ./le.ts} — little-endian uint32 helpers.
 *
 * The protocol is a simple binary format built on top of JSON with UTF-8
 * encoding and an additional byte-array primitive. Each packet consists of
 * a 4-byte little-endian length prefix followed by the encoded payload.
 *
 * This barrel keeps the historical `./stdio_protocol.ts` import path
 * resolving to the same public surface.
 *
 * @see ./packet.ts
 * @see ./messages.ts
 * @see ./utf8.ts
 * @see ./le.ts
 */
export type {
  AnalyzeMetafileRequest,
  AnalyzeMetafileResponse,
  FormatMsgsRequest,
  FormatMsgsResponse,
} from './formatter_messages.ts'
export type {
  BuildOutputFile,
  BuildPlugin,
  BuildRequest,
  BuildResponse,
  CancelRequest,
  DisposeRequest,
  OnEndRequest,
  OnEndResponse,
  PingRequest,
  RebuildRequest,
  RebuildResponse,
  ResolveRequest,
  ResolveResponse,
  ServeRequest,
  ServeResponse,
  TransformRequest,
  TransformResponse,
  WatchRequest,
} from './messages.ts'
export type {
  OnLoadRequest,
  OnLoadResponse,
  OnResolveRequest,
  OnResolveResponse,
  OnServeRequest,
  OnStartRequest,
  OnStartResponse,
} from './plugin_messages.ts'
export type { Packet, Value } from './packet.ts'
export { decodePacket, encodePacket } from './packet.ts'
export { decodeUTF8, encodeUTF8 } from './utf8.ts'
export { readUInt32LE } from './le.ts'
