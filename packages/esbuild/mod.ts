/**
 * @module
 * Main entrypoint for the `@ggpwnkthx/esbuild` package, providing the full
 * esbuild JavaScript API for Deno with automatic binary management.
 *
 * The module downloads the appropriate esbuild binary for your platform on
 * first use and keeps it cached. All standard esbuild build functions are
 * available, including `build`, `context`, `transform`, and `formatMessages`.
 *
 * All API calls are asynchronous and return promises. The synchronous APIs
 * (`buildSync`, `transformSync`, `formatMessagesSync`, `analyzeMetafileSync`)
 * throw in Deno because synchronous stdin/stdout is not supported.
 *
 * **You must call `stop()` when done** to terminate the esbuild child process;
 * otherwise your Deno process will hang indefinitely. This is especially
 * important in tests.
 *
 * Call `initialize()` to pre-initialize the esbuild service before first use
 * (usually not needed — the service starts lazily on first API call).
 *
 * @see ./wasm
 * @see ./binary_installer
 * @example
 * ```ts
 * import { build } from "@ggpwnkthx/esbuild";
 *
 * const result = await build({
 *   entryPoints: ["src/index.ts"],
 *   outfile: "dist/bundle.js",
 *   bundle: true,
 * });
 *
 * await stop(); // prevent hang
 * ```
 */
import type * as types from './shared/types.ts'
/** @see ../shared/types.ts:BuildOptions */
export type { BuildOptions } from './shared/types.ts'
/** @see ../shared/types.ts:Loader */
export type { Loader } from './shared/types.ts'
/** @see ../shared/types.ts:OnLoadArgs */
export type { OnLoadArgs } from './shared/types.ts'
/** @see ../shared/types.ts:OnLoadResult */
export type { OnLoadResult } from './shared/types.ts'
/** @see ../shared/types.ts:OnResolveArgs */
export type { OnResolveArgs } from './shared/types.ts'
/** @see ../shared/types.ts:OnResolveResult */
export type { OnResolveResult } from './shared/types.ts'
/** @see ../shared/types.ts:Platform */
export type { Platform } from './shared/types.ts'
/** @see ../shared/types.ts:Plugin */
export type { Plugin } from './shared/types.ts'
/** @see ../shared/types.ts:PluginBuild */
export type { PluginBuild } from './shared/types.ts'
/** @see ../shared/types.ts:TransformOptions */
export type { TransformOptions } from './shared/types.ts'
import * as common from './shared/common.ts'
import * as ourselves from './mod.ts'
import { install } from './binary_installer.ts'

/** The esbuild binary version string (e.g. "0.28.1").
 * @see https://github.com/evanw/esbuild/releases */
export const version = common.ESBUILD_VERSION

/** @see ../shared/types.ts:build
 * @param options - Configuration options for the build.
 * @example
 * ```ts
 * const result = await build({
 *   entryPoints: ["src/index.ts"],
 *   bundle: true,
 *   outfile: "dist/bundle.js",
 * });
 * ```
 */
export const build: typeof types.build = (options: types.BuildOptions) =>
  ensureServiceIsRunning().then((service) => service.build(options))

/** @see ../shared/types.ts:context
 * @param options - Configuration options for the build context.
 * @example
 * ```ts
 * const ctx = await context({
 *   entryPoints: ["src/index.ts"],
 *   bundle: true,
 *   outdir: "dist",
 * });
 * await ctx.watch();
 * await ctx.serve({ servedir: "dist", port: 8000 });
 * await ctx.dispose();
 * ```
 */
export const context: typeof types.context = (options: types.BuildOptions) =>
  ensureServiceIsRunning().then((service) => service.context(options))

/** @see ../shared/types.ts:transform
 * @param input - The source code (string) or raw bytes to transform.
 * @param options - Optional transform configuration.
 * @example
 * ```ts
 * const result = await transform("const x: number = 1;", {
 *   loader: "ts",
 *   minify: true,
 * });
 * console.log(result.code);
 * ```
 */
export const transform: typeof types.transform = (
  input: string | Uint8Array,
  options?: types.TransformOptions,
) => ensureServiceIsRunning().then((service) => service.transform(input, options))

/** @see ../shared/types.ts:formatMessages
 * @param messages - An array of diagnostic messages to format.
 * @param options - Configuration for the formatter, including `kind` ("error" or "warning").
 * @example
 * ```ts
 * const messages = [{ text: "Something went wrong", location: { file: "src/index.ts", line: 1, column: 0, lineText: "", length: 0 } }];
 * const formatted = await formatMessages(messages, { kind: "error" });
 * console.log(formatted.join("\n"));
 * ```
 */
export const formatMessages: typeof types.formatMessages = (
  messages,
  options,
) => ensureServiceIsRunning().then((service) => service.formatMessages(messages, options))

/** @see ../shared/types.ts:analyzeMetafile
 * @param metafile - The metafile JSON string or object to analyze.
 * @param options - Optional analysis configuration.
 * @example
 * ```ts
 * const result = await build({ entryPoints: ["src/index.ts"], metafile: true });
 * const analysis = await analyzeMetafile(result.metafile);
 * console.log(analysis);
 * ```
 */
export const analyzeMetafile: typeof types.analyzeMetafile = (
  metafile,
  options,
) => ensureServiceIsRunning().then((service) => service.analyzeMetafile(metafile, options))

const syncStubs = common.createSyncStubs()

/** @see ../shared/types.ts:buildSync
 * @example
 * ```ts
 * // Throws: The "buildSync" API does not work in Deno
 * buildSync({ entryPoints: ["src/index.ts"] });
 * ```
 */
export const buildSync = syncStubs.buildSync

/** @see ../shared/types.ts:transformSync
 * @example
 * ```ts
 * // Throws: The "transformSync" API does not work in Deno
 * transformSync("const x: number = 1;", { loader: "ts" });
 * ```
 */
export const transformSync = syncStubs.transformSync

/** @see ../shared/types.ts:formatMessagesSync
 * @example
 * ```ts
 * // Throws: The "formatMessagesSync" API does not work in Deno
 * formatMessagesSync([{ text: "error" }], { kind: "error" });
 * ```
 */
export const formatMessagesSync = syncStubs.formatMessagesSync

/** @see ../shared/types.ts:analyzeMetafileSync
 * @example
 * ```ts
 * // Throws: The "analyzeMetafileSync" API does not work in Deno
 * analyzeMetafileSync("{ inputs: {} }", {});
 * ```
 */
export const analyzeMetafileSync = syncStubs.analyzeMetafileSync

/** @see ../shared/types.ts:stop
 * @example
 * ```ts
 * // ... use esbuild ...
 * await stop(); // prevents hang
 * ```
 */
export const stop = async (): Promise<void> => {
  if (stopService) await stopService()
}

let initializeWasCalled = false

/** @see ../shared/types.ts:initialize
 * @example
 * ```ts
 * // Pre-initialize the esbuild service before first use
 * await initialize({});
 * ```
 */
export const initialize: typeof types.initialize = async (options) => {
  options = common.validateInitializeOptions(options || {})
  if (options.wasmURL) {
    throw new Error(`The "wasmURL" option only works in the browser`)
  }
  if (options.wasmModule) {
    throw new Error(`The "wasmModule" option only works in the browser`)
  }
  if (options.worker) {
    throw new Error(`The "worker" option only works in the browser`)
  }
  if (initializeWasCalled) {
    throw new Error('Cannot call "initialize" more than once')
  }
  await ensureServiceIsRunning()
  initializeWasCalled = true
}

type Service = common.Service

const defaultWD = Deno.cwd()

const nativeTransformFs: common.StreamFS = {
  readFile(tempFile, callback) {
    Deno.readFile(tempFile).then(
      (bytes) => {
        const text = new TextDecoder().decode(bytes)
        try {
          Deno.remove(tempFile)
        } catch (_e) {
          // Ignore error
        }
        callback(null, text)
      },
      (err) => callback(err, null),
    )
  },
  writeFile(contents, callback) {
    Deno.makeTempFile().then(
      (tempFile) =>
        Deno.writeFile(
          tempFile,
          typeof contents === 'string' ? new TextEncoder().encode(contents) : contents,
        ).then(
          () => callback(tempFile),
          () => callback(null),
        ),
      () => callback(null),
    )
  },
}
let longLivedService: Promise<Service> | undefined
let stopService: (() => Promise<void>) | undefined

// Minimal subprocess handle used by the native-binary transport. The shape is
// deliberately narrow (only what the esbuild service needs) so the underlying
// implementation can be swapped for a test double in a future change.
interface SpawnHandle {
  write(bytes: Uint8Array): void
  read(): Promise<Uint8Array | null>
  close(): Promise<void> | void
  status(): Promise<{ code: number }>
}

/** Options for {@link spawn}. */
interface SpawnOptions {
  args: string[]
  stdin: 'piped' | 'inherit'
  stdout: 'piped' | 'inherit'
  stderr: 'inherit'
}

/** Spawns the esbuild binary and returns a {@link SpawnHandle} for it. */
type SpawnFn = (cmd: string, options: SpawnOptions) => SpawnHandle

/**
 * Spawns the esbuild binary using `Deno.Command` (Deno ≥1.40). The
 * `SpawnFn` indirection lets future tests inject a fake subprocess without
 * touching call sites.
 */
const spawn: SpawnFn = (cmd, { args, stdin, stdout, stderr }) => {
  const child = new Deno.Command(cmd, {
    args,
    cwd: defaultWD,
    stdin,
    stdout,
    stderr,
  }).spawn()
  // Note: Need to check for "piped" in Deno ≥1.31.0 to avoid a crash
  const writer = stdin === 'piped' ? child.stdin.getWriter() : null
  const reader = stdout === 'piped' ? child.stdout.getReader() : null
  return {
    write: writer ? (bytes) => writer.write(bytes) : () => Promise.resolve(),
    read: reader ? () => reader.read().then((x) => x.value || null) : () => Promise.resolve(null),
    close: async () => {
      // We can't call "kill()" because it doesn't seem to work. Tests will
      // still fail with "A child process was opened during the test, but not
      // closed during the test" even though we kill the child process.
      //
      // And we can't call both "writer.close()" and "kill()" because then
      // there's a race as the child process exits when stdin is closed, and
      // "kill()" fails when the child process has already been killed.
      //
      // So instead we just call "writer.close()" and then hope that this
      // causes the child process to exit. It won't work if the stdin consumer
      // thread in the child process is hung or busy, but that may be the best
      // we can do.
      //
      // See this for more info: https://github.com/evanw/esbuild/pull/3611
      if (writer) await writer.close()
      if (reader) await reader.cancel()

      // Wait for the process to exit. The new "kill()" API doesn't flag the
      // process as having exited because processes can technically ignore the
      // kill signal. Without this, Deno will fail tests that use esbuild with
      // an error because the test spawned a process but didn't wait for it.
      await child.status
    },
    status: () => child.status,
  }
}

const ensureServiceIsRunning = (): Promise<Service> => {
  if (!longLivedService) {
    longLivedService = (async (): Promise<Service> => {
      const binPath = await install()
      const isTTY = Deno.stderr.isTerminal ? Deno.stderr.isTerminal() : false

      const child = spawn(binPath, {
        args: [`--service=${version}`],
        stdin: 'piped',
        stdout: 'piped',
        stderr: 'inherit',
      })

      stopService = async () => {
        // Close all resources related to the subprocess.
        await child.close()
        initializeWasCalled = false
        longLivedService = undefined
        stopService = undefined
      }

      const { readFromStdout, afterClose, service } = common.createChannel({
        writeToStdin(bytes) {
          child.write(bytes)
        },
        isSync: false,
        hasFS: true,
        esbuild: ourselves,
      })

      const readMoreStdout = () =>
        child.read().then((buffer) => {
          if (buffer === null) {
            afterClose(null)
          } else {
            readFromStdout(buffer)
            readMoreStdout()
          }
        }).catch((e) => {
          if (
            e instanceof Deno.errors.Interrupted ||
            e instanceof Deno.errors.BadResource
          ) {
            // ignore the error if read was interrupted (stdout was closed)
            afterClose(e)
          } else {
            throw e
          }
        })
      readMoreStdout()

      return common.createService(service, {
        isTTY,
        defaultWD,
        transformFs: nativeTransformFs,
      })
    })()
  }
  return longLivedService
}

// If we're called as the main script, forward the CLI to the underlying executable
if (import.meta.main) {
  spawn(await install(), {
    args: Deno.args,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  }).status().then(({ code }) => {
    Deno.exit(code)
  })
}
