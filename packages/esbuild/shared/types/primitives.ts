/**
 * @module
 * Primitive string-literal union types used across the esbuild option
 * surface. Pure compile-time declarations; no runtime emission.
 *
 * @see https://esbuild.github.io/api/
 */
/**
 * The platform to bundle for.
 *
 * @see https://esbuild.github.io/api/#platform
 */
export type Platform = 'browser' | 'node' | 'neutral'
/**
 * The output format of the bundle.
 *
 * @see https://esbuild.github.io/api/#format
 */
export type Format = 'iife' | 'cjs' | 'esm'
/**
 * Built-in loaders that map a file extension to how esbuild interprets the file.
 *
 * @see https://esbuild.github.io/api/#loader
 */
export type Loader =
  | 'base64'
  | 'binary'
  | 'copy'
  | 'css'
  | 'dataurl'
  | 'default'
  | 'empty'
  | 'file'
  | 'js'
  | 'json'
  | 'jsx'
  | 'local-css'
  | 'text'
  | 'ts'
  | 'tsx'
/**
 * The log level that esbuild uses when printing log messages.
 *
 * @see https://esbuild.github.io/api/#log-level
 */
export type LogLevel =
  | 'verbose'
  | 'debug'
  | 'info'
  | 'warning'
  | 'error'
  | 'silent'
/**
 * The character set to use when loading text-based files.
 *
 * @see https://esbuild.github.io/api/#charset
 */
export type Charset = 'ascii' | 'utf8'
/**
 * Debugger-like features whose calls should be removed from output.
 *
 * @see https://esbuild.github.io/api/#drop
 */
export type Drop = 'console' | 'debugger'
/**
 * Output paths whose values should be made absolute.
 *
 * @see https://esbuild.github.io/api/#abs-paths
 */
export type AbsPaths = 'code' | 'log' | 'metafile'
