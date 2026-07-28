/**
 * @module
 * Result-type declarations for the `build` and `transform` flag builders.
 * Split out from the runtime builders so consumers can reference these
 * shapes without pulling in the entire flag-emission logic.
 *
 * @see ./build.ts
 * @see ./transform.ts
 */
import type { MangleCache } from '../validation.ts'

/** Output of {@link ./build.ts:flagsForBuildOptions}: the assembled CLI
 * flags plus the side-channel data that the transport needs to package
 * the request. */
export interface BuildFlagsResult {
  /** Resolved entry-point pairs (`output`, `input`). */
  entries: [string, string][]
  /** CLI flags string to send to the service. */
  flags: string[]
  /** Whether the service should write output files to disk. */
  write: boolean
  /** Synthetic stdin contents used when the service has no real stdin. */
  stdinContents: Uint8Array | null
  /** Resolve directory for the synthetic stdin. */
  stdinResolveDir: string | null
  /** Override for the build's working directory. */
  absWorkingDir: string | undefined
  /** Value to copy to `NODE_PATH` for the service child. */
  nodePaths: string[]
  /** Validated mangle cache to forward to the service. */
  mangleCache: MangleCache | undefined
}

/** Output of {@link ./transform.ts:flagsForTransformOptions}: the assembled
 * CLI flags plus the validated mangle cache. */
export interface TransformFlagsResult {
  /** CLI flags string to send to the service. */
  flags: string[]
  /** Validated mangle cache to forward to the service. */
  mangleCache: MangleCache | undefined
}
