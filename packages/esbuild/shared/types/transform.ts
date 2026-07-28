/**
 * @module
 * Transform configuration types: `TransformOptions`, `TransformResult`,
 * `TransformFailure`.
 *
 * @see ./common.ts
 * @see ./diagnostics.ts
 * @see https://esbuild.github.io/api/#transform-api
 */
import type { Message } from './diagnostics.ts'
import type { Loader } from './primitives.ts'
import type { CommonOptions } from './common.ts'

/**
 * Options for configuring a single esbuild transform.
 *
 * @see https://esbuild.github.io/api/#transform-api
 */
export interface TransformOptions extends CommonOptions {
  /** Documentation: https://esbuild.github.io/api/#sourcefile */
  sourcefile?: string
  /** Documentation: https://esbuild.github.io/api/#loader */
  loader?: Loader
  /** Documentation: https://esbuild.github.io/api/#banner */
  banner?: string
  /** Documentation: https://esbuild.github.io/api/#footer */
  footer?: string
}

/**
 * The result of a successful esbuild transform.
 *
 * @see https://esbuild.github.io/api/#transform-api
 */
export interface TransformResult<
  ProvidedOptions extends TransformOptions = TransformOptions,
> {
  /** Transformed source code. */
  code: string
  /** Source map string, or empty when not requested. */
  map: string
  /** Warnings collected during the transform. */
  warnings: Message[]
  /** Only when "mangleCache" is present */
  mangleCache:
    | Record<string, string | false>
    | (ProvidedOptions['mangleCache'] extends object ? never : undefined)
  /** Only when "legalComments" is "external" */
  legalComments:
    | string
    | (ProvidedOptions['legalComments'] extends 'external' ? never : undefined)
}

/**
 * The error value rejected from a failed esbuild transform.
 *
 * @see https://esbuild.github.io/api/#transform-api
 */
export interface TransformFailure extends Error {
  /** Errors that caused the transform to fail. */
  errors: Message[]
  /** Warnings collected before the transform failed. */
  warnings: Message[]
}
