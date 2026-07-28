/**
 * @module
 * Public function declarations for the esbuild API surface, plus the
 * `InitializeOptions` shape and the `version` runtime binding.
 *
 * The actual implementations live in {@link ../transport.ts} and
 * {@link ../create_esbuild_api.ts}; this module only declares the
 * signatures so consumers can reference them in `typeof` expressions and
 * `PluginBuild.esbuild` shape definitions.
 *
 * @see ./build.ts
 * @see ./transform.ts
 * @see ./diagnostics.ts
 * @see ./metafile.ts
 */
import type { BuildContext, BuildOptions, BuildResult } from './build.ts'
import type { Metafile } from './metafile.ts'
import type { PartialMessage } from './diagnostics.ts'
import type { FormatMessagesOptions } from './diagnostics.ts'
import type { AnalyzeMetafileOptions } from './metafile.ts'
import type { TransformOptions, TransformResult } from './transform.ts'

/**
 * Type-level helper that rejects properties with typos in object literals.
 * Excess keys (present on `In` but not on `Out`) are typed as `never`, so
 * TypeScript catches them at the call site.
 *
 * @see https://stackoverflow.com/questions/49580725
 */
export type SameShape<Out, In extends Out> =
  & In
  & { [Key in Exclude<keyof In, keyof Out>]: never }

/**
 * This function invokes the "esbuild" command-line tool for you. It returns a
 * promise that either resolves with a "BuildResult" object or rejects with a
 * "BuildFailure" object.
 *
 * - Works in node: yes
 * - Works in browser: yes
 *
 * Documentation: https://esbuild.github.io/api/#build
 */
export declare function build<T extends BuildOptions>(
  options: SameShape<BuildOptions, T>,
): Promise<BuildResult<T>>

/**
 * This is the advanced long-running form of "build" that supports additional
 * features such as watch mode and a local development server.
 *
 * - Works in node: yes
 * - Works in browser: no
 *
 * Documentation: https://esbuild.github.io/api/#build
 */
export declare function context<T extends BuildOptions>(
  options: SameShape<BuildOptions, T>,
): Promise<BuildContext<T>>

/**
 * This function transforms a single JavaScript file. It can be used to minify
 * JavaScript, convert TypeScript/JSX to JavaScript, or convert newer JavaScript
 * to older JavaScript. It returns a promise that is either resolved with a
 * "TransformResult" object or rejected with a "TransformFailure" object.
 *
 * - Works in node: yes
 * - Works in browser: yes
 *
 * Documentation: https://esbuild.github.io/api/#transform
 */
export declare function transform<T extends TransformOptions>(
  input: string | Uint8Array,
  options?: SameShape<TransformOptions, T>,
): Promise<TransformResult<T>>

/**
 * Converts log messages to formatted message strings suitable for printing in
 * the terminal. This allows you to reuse the built-in behavior of esbuild's
 * log message formatter. This is a batch-oriented API for efficiency.
 *
 * - Works in node: yes
 * - Works in browser: yes
 */
export declare function formatMessages(
  messages: PartialMessage[],
  options: FormatMessagesOptions,
): Promise<string[]>

/**
 * Pretty-prints an analysis of the metafile JSON to a string. This is just for
 * convenience to be able to match esbuild's pretty-printing exactly. If you want
 * to customize it, you can just inspect the data in the metafile yourself.
 *
 * - Works in node: yes
 * - Works in browser: yes
 *
 * Documentation: https://esbuild.github.io/api/#analyze
 */
export declare function analyzeMetafile(
  metafile: Metafile | string,
  options?: AnalyzeMetafileOptions,
): Promise<string>

/**
 * A synchronous version of "build".
 *
 * - Works in node: yes
 * - Works in browser: no
 *
 * Documentation: https://esbuild.github.io/api/#build
 */
export declare function buildSync<T extends BuildOptions>(
  options: SameShape<BuildOptions, T>,
): BuildResult<T>

/**
 * A synchronous version of "transform".
 *
 * - Works in node: yes
 * - Works in browser: no
 *
 * Documentation: https://esbuild.github.io/api/#transform
 */
export declare function transformSync<T extends TransformOptions>(
  input: string | Uint8Array,
  options?: SameShape<TransformOptions, T>,
): TransformResult<T>

/**
 * A synchronous version of "formatMessages".
 *
 * - Works in node: yes
 * - Works in browser: no
 */
export declare function formatMessagesSync(
  messages: PartialMessage[],
  options: FormatMessagesOptions,
): string[]

/**
 * A synchronous version of "analyzeMetafile".
 *
 * - Works in node: yes
 * - Works in browser: no
 *
 * Documentation: https://esbuild.github.io/api/#analyze
 */
export declare function analyzeMetafileSync(
  metafile: Metafile | string,
  options?: AnalyzeMetafileOptions,
): string

/**
 * This configures the browser-based version of esbuild. It is necessary to
 * call this first and wait for the returned promise to be resolved before
 * making other API calls when using esbuild in the browser.
 *
 * - Works in node: yes
 * - Works in browser: yes ("options" is required)
 *
 * Documentation: https://esbuild.github.io/api/#browser
 */
export declare function initialize(options: InitializeOptions): Promise<void>

/**
 * Options accepted by {@link initialize}.
 *
 * @see https://esbuild.github.io/api/#browser
 */
export interface InitializeOptions {
  /**
   * The URL of the "esbuild.wasm" file. This must be provided when running
   * esbuild in the browser.
   */
  wasmURL?: string | URL

  /**
   * The result of calling "new WebAssembly.Module(buffer)" where "buffer"
   * is a typed array or ArrayBuffer containing the binary code of the
   * "esbuild.wasm" file.
   *
   * You can use this as an alternative to "wasmURL" for environments where it's
   * not possible to download the WebAssembly module.
   */
  wasmModule?: WebAssembly.Module

  /**
   * By default esbuild runs the WebAssembly-based browser API in a web worker
   * to avoid blocking the UI thread. This can be disabled by setting "worker"
   * to false.
   */
  worker?: boolean
}

/** The version string of the embedded esbuild binary. */
export let version: string

/**
 * Call this function to terminate esbuild's child process. The child process
 * is not terminated and re-created after each API call because it's more
 * efficient to keep it around when there are multiple API calls.
 *
 * In node this happens automatically before the parent node process exits. So
 * you only need to call this if you know you will not make any more esbuild
 * API calls and you want to clean up resources.
 *
 * Unlike node, Deno lacks the necessary APIs to clean up child processes
 * automatically. You must manually call stop() in Deno when you're done
 * using esbuild or Deno will continue running forever.
 *
 * Another reason you might want to call this is if you are using esbuild from
 * within a Deno test. Deno fails tests that create a child process without
 * killing it before the test ends, so you have to call this function (and
 * await the returned promise) in every Deno test that uses esbuild.
 */
export declare function stop(): Promise<void>
