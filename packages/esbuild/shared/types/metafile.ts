/**
 * @module
 * Metafile and analyze-metafile types: `Metafile`, `AnalyzeMetafileOptions`.
 *
 * @see ./build.ts
 * @see https://esbuild.github.io/api/#metafile
 */
import type { ImportKind } from './plugin.ts'

/** Documentation: https://esbuild.github.io/api/#metafile */
export interface Metafile {
  /** Inputs read by the build, keyed by path. */
  inputs: {
    [path: string]: {
      /** Size of the input on disk, in bytes. */
      bytes: number
      imports: {
        /** Path the input imports. */
        path: string
        /** Kind of import that triggered the load. */
        kind: ImportKind
        /** Whether the imported path is external. */
        external?: boolean
        /** Original text the bundler rewrote into `path`. */
        original?: string
        /** Import attributes (e.g. `{ type: "json" }`). */
        with?: Record<string, string>
      }[]
      /** Module format detected for the input. */
      format?: 'cjs' | 'esm'
      /** Import attributes for the input module. */
      with?: Record<string, string>
    }
  }
  /** Outputs produced by the build, keyed by path. */
  outputs: {
    [path: string]: {
      /** Size of the output on disk, in bytes. */
      bytes: number
      inputs: {
        [path: string]: {
          /** Bytes contributed by the input to the output. */
          bytesInOutput: number
        }
      }
      imports: {
        /** Path the output imports. */
        path: string
        /** Kind of import that triggered the load. */
        kind: ImportKind | 'file-loader'
        /** Whether the imported path is external. */
        external?: boolean
      }[]
      /** Names exported by the output. */
      exports: string[]
      /** Entry point that produced this output, if any. */
      entryPoint?: string
      /** Path to the bundled CSS sibling, if any. */
      cssBundle?: string
    }
  }
}

/**
 * Options for analyzing a metafile with `analyzeMetafile`.
 *
 * @see https://esbuild.github.io/api/#analyze
 */
export interface AnalyzeMetafileOptions {
  /** Whether to emit ANSI color escapes. */
  color?: boolean
  /** Whether to include every input in the analysis output. */
  verbose?: boolean
}
