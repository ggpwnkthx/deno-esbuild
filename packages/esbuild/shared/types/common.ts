/**
 * @module
 * Shared option types referenced by both `BuildOptions` and
 * `TransformOptions`, plus the `TsconfigRaw` shape recognized by esbuild's
 * TypeScript handling.
 *
 * @see ./build.ts
 * @see ./transform.ts
 * @see https://esbuild.github.io/api/#tsconfig-raw
 */
import type { TsconfigRaw } from './tsconfig.ts'

/**
 * Options shared between {@link ./build.ts:BuildOptions} and
 * {@link ./transform.ts:TransformOptions}. Re-exported as a public structural
 * supertype so consumers can name the common shape when constructing partial
 * option objects.
 */
export interface CommonOptions {
  /** Documentation: https://esbuild.github.io/api/#sourcemap */
  sourcemap?: boolean | 'linked' | 'inline' | 'external' | 'both'
  /** Documentation: https://esbuild.github.io/api/#legal-comments */
  legalComments?: 'none' | 'inline' | 'eof' | 'linked' | 'external'
  /** Documentation: https://esbuild.github.io/api/#source-root */
  sourceRoot?: string
  /** Documentation: https://esbuild.github.io/api/#sources-content */
  sourcesContent?: boolean

  /** Documentation: https://esbuild.github.io/api/#format */
  format?: import('./primitives.ts').Format
  /** Documentation: https://esbuild.github.io/api/#global-name */
  globalName?: string
  /** Documentation: https://esbuild.github.io/api/#target */
  target?: string | string[]
  /** Documentation: https://esbuild.github.io/api/#supported */
  supported?: Record<string, boolean>
  /** Documentation: https://esbuild.github.io/api/#platform */
  platform?: import('./primitives.ts').Platform

  /** Documentation: https://esbuild.github.io/api/#mangle-props */
  mangleProps?: RegExp
  /** Documentation: https://esbuild.github.io/api/#mangle-props */
  reserveProps?: RegExp
  /** Documentation: https://esbuild.github.io/api/#mangle-props */
  mangleQuoted?: boolean
  /** Documentation: https://esbuild.github.io/api/#mangle-props */
  mangleCache?: Record<string, string | false>
  /** Documentation: https://esbuild.github.io/api/#drop */
  drop?: import('./primitives.ts').Drop[]
  /** Documentation: https://esbuild.github.io/api/#drop-labels */
  dropLabels?: string[]
  /** Documentation: https://esbuild.github.io/api/#minify */
  minify?: boolean
  /** Documentation: https://esbuild.github.io/api/#minify */
  minifyWhitespace?: boolean
  /** Documentation: https://esbuild.github.io/api/#minify */
  minifyIdentifiers?: boolean
  /** Documentation: https://esbuild.github.io/api/#minify */
  minifySyntax?: boolean
  /** Documentation: https://esbuild.github.io/api/#line-limit */
  lineLimit?: number
  /** Documentation: https://esbuild.github.io/api/#charset */
  charset?: import('./primitives.ts').Charset
  /** Documentation: https://esbuild.github.io/api/#tree-shaking */
  treeShaking?: boolean
  /** Documentation: https://esbuild.github.io/api/#ignore-annotations */
  ignoreAnnotations?: boolean

  /** Documentation: https://esbuild.github.io/api/#jsx */
  jsx?: 'transform' | 'preserve' | 'automatic'
  /** Documentation: https://esbuild.github.io/api/#jsx-factory */
  jsxFactory?: string
  /** Documentation: https://esbuild.github.io/api/#jsx-fragment */
  jsxFragment?: string
  /** Documentation: https://esbuild.github.io/api/#jsx-import-source */
  jsxImportSource?: string
  /** Documentation: https://esbuild.github.io/api/#jsx-development */
  jsxDev?: boolean
  /** Documentation: https://esbuild.github.io/api/#jsx-side-effects */
  jsxSideEffects?: boolean

  /** Documentation: https://esbuild.github.io/api/#define */
  define?: { [key: string]: string }
  /** Documentation: https://esbuild.github.io/api/#pure */
  pure?: string[]
  /** Documentation: https://esbuild.github.io/api/#keep-names */
  keepNames?: boolean

  /** Documentation: https://esbuild.github.io/api/#abs-paths */
  absPaths?: import('./primitives.ts').AbsPaths[]
  /** Documentation: https://esbuild.github.io/api/#color */
  color?: boolean
  /** Documentation: https://esbuild.github.io/api/#log-level */
  logLevel?: import('./primitives.ts').LogLevel
  /** Documentation: https://esbuild.github.io/api/#log-limit */
  logLimit?: number
  /** Documentation: https://esbuild.github.io/api/#log-override */
  logOverride?: Record<string, import('./primitives.ts').LogLevel>

  /** Documentation: https://esbuild.github.io/api/#tsconfig-raw */
  tsconfigRaw?: string | TsconfigRaw
}
