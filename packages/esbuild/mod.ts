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
import * as common from './shared/mod.ts'
import * as ourselves from './mod.ts'
import { install } from './binary_installer.ts'
import { spawnWithDenoCommand } from './shared/spawn.ts'
import { createEsbuildApi } from './shared/create_esbuild_api.ts'
import type { EsbuildApi } from './shared/create_esbuild_api.ts'

/** The esbuild binary version string (e.g. "0.28.1").
 * @see https://github.com/evanw/esbuild/releases */
export const version = common.ESBUILD_VERSION

/** Default working directory used when a build does not specify
 * `absWorkingDir`. Captured at module load time. */
const defaultWD = Deno.cwd()

/** File system shim used by the native transport to shuttle transform
 * output back from the service child. The native binary writes its
 * compile result to a temp file that the host reads back. */
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

/** Promise that resolves to the started service. Undefined until the
 * first API call triggers service startup. */
let longLivedService: Promise<common.Service> | undefined
/** Stop function invoked by the public `stop()` API. Undefined until the
 * service has been started. */
let stopService: (() => Promise<void>) | undefined
/** Set to `true` by the `initialize()` hook so we only accept a single
 * `initialize()` call per process. */
let initializeWasCalled = false

/** Returns the running esbuild service, starting it on first call. */
const ensureServiceIsRunning = (): Promise<common.Service> => {
  if (!longLivedService) {
    longLivedService = (async (): Promise<common.Service> => {
      const binPath = await install()
      const isTTY = Deno.stderr.isTerminal ? Deno.stderr.isTerminal() : false

      const child = spawnWithDenoCommand(binPath, {
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

/** Public API surface of the native transport. */
const api: EsbuildApi = createEsbuildApi({
  ensureService: ensureServiceIsRunning,
  syncStubs: common.createSyncStubs(),
  runtime: 'native',
  stop: async () => {
    if (stopService) await stopService()
  },
  onValidate: () => {
    if (initializeWasCalled) {
      throw new Error('Cannot call "initialize" more than once')
    }
    initializeWasCalled = true
  },
})

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
export const build = api.build
/** @see ../shared/types.ts:context */
export const context = api.context
/** @see ../shared/types.ts:transform */
export const transform = api.transform
/** @see ../shared/types.ts:formatMessages */
export const formatMessages = api.formatMessages
/** @see ../shared/types.ts:analyzeMetafile */
export const analyzeMetafile = api.analyzeMetafile
/** @see ../shared/types.ts:buildSync */
export const buildSync = api.buildSync
/** @see ../shared/types.ts:transformSync */
export const transformSync = api.transformSync
/** @see ../shared/types.ts:formatMessagesSync */
export const formatMessagesSync = api.formatMessagesSync
/** @see ../shared/types.ts:analyzeMetafileSync */
export const analyzeMetafileSync = api.analyzeMetafileSync
/** @see ../shared/types.ts:stop */
export const stop = api.stop
/** @see ../shared/types.ts:initialize */
export const initialize = api.initialize

// If we're called as the main script, forward the CLI to the underlying executable
if (import.meta.main) {
  spawnWithDenoCommand(await install(), {
    args: Deno.args,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  }).status().then(({ code }: { code: number }) => {
    Deno.exit(code)
  })
}
