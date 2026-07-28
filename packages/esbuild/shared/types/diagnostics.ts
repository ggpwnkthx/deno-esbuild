/**
 * @module
 * Diagnostic message types: `Message`, `Note`, `Location`, `PartialMessage`,
 * `PartialNote`, and `FormatMessagesOptions`.
 *
 * @see ./build.ts
 * @see ./plugin.ts
 * @see https://esbuild.github.io/api/#errors
 */

/**
 * A single esbuild log message (error or warning).
 *
 * @see https://esbuild.github.io/api/#errors
 */
export interface Message {
  /** Stable identifier for the error category (e.g. `"TS2322"`). */
  id: string
  /** Name of the plugin that produced the message, or empty for the service. */
  pluginName: string
  /** Human-readable description of the diagnostic. */
  text: string
  /** Source location the diagnostic refers to, or null if unknown. */
  location: Location | null
  /** Additional notes attached to the message. */
  notes: Note[]

  /**
   * Optional user-specified data that is passed through unmodified. You can
   * use this to stash the original error, for example.
   */
  // deno-lint-ignore no-explicit-any
  detail: any
}

/**
 * A secondary note attached to a {@link Message}.
 *
 * @see https://esbuild.github.io/api/#errors
 */
export interface Note {
  /** Human-readable description of the note. */
  text: string
  /** Source location the note refers to, or null if unknown. */
  location: Location | null
}

/**
 * The source location associated with a {@link Message} or {@link Note}.
 *
 * @see https://esbuild.github.io/api/#errors
 */
export interface Location {
  /** Absolute path of the file the diagnostic refers to. */
  file: string
  /** Loader namespace (e.g. `"file"`, `"http"`) associated with the path. */
  namespace: string
  /** 1-based line number. */
  line: number
  /** 0-based column offset, in bytes. */
  column: number
  /** Length of the highlighted region, in bytes. */
  length: number
  /** Text of the source line that contains the diagnostic. */
  lineText: string
  /** Replacement text suggested by esbuild, or empty if none. */
  suggestion: string
}

/**
 * A partial version of {@link Message} where every field is optional. Returned
 * by plugin callbacks that may not have full information about an issue.
 *
 * @see https://esbuild.github.io/plugins/#on-start
 */
export interface PartialMessage {
  /** Stable identifier for the error category (e.g. `"TS2322"`). */
  id?: string
  /** Name of the plugin that produced the message, or empty for the service. */
  pluginName?: string
  /** Human-readable description of the diagnostic. */
  text?: string
  /** Source location the diagnostic refers to, or null if unknown. */
  location?: Partial<Location> | null
  /** Additional notes attached to the message. */
  notes?: PartialNote[]
  /** Optional user-specified data passed through unmodified. */
  // deno-lint-ignore no-explicit-any
  detail?: any
}

/**
 * A partial version of {@link Note} where every field is optional.
 *
 * @see https://esbuild.github.io/plugins/#on-start
 */
export interface PartialNote {
  /** Human-readable description of the note. */
  text?: string
  /** Source location the note refers to, or null if unknown. */
  location?: Partial<Location> | null
}

/**
 * Options for formatting diagnostic messages with the `formatMessages` API.
 *
 * @see https://esbuild.github.io/api/#format-messages
 */
export interface FormatMessagesOptions {
  /** Whether the messages are errors or warnings. */
  kind: 'error' | 'warning'
  /** Whether to emit ANSI color escapes. */
  color?: boolean
  /** Width of the terminal used for line wrapping. */
  terminalWidth?: number
}
