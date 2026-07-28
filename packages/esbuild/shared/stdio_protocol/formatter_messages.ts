/**
 * @module
 * Wire-protocol DTOs for the `format-msgs` and `analyze-metafile`
 * service-level commands. Pure type declarations — no runtime emission.
 *
 * @see ./messages.ts
 * @see ../types.ts
 */
import type * as types from '../types/mod.ts'

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
