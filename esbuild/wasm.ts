/**
 * @module
 * WASM entrypoint for the `@ggpwnkthx/esbuild` package, used as the fallback
 * when no native binary is available for the current `Deno.build.target`.
 *
 * The wasm build is loaded into a Deno Worker and uses the Go WebAssembly
 * runtime (`wasm_exec.js`) shipped alongside `esbuild.wasm` in the package.
 *
 * All standard esbuild build functions are available, including `build`,
 * `context`, `transform`, `formatMessages`, `analyzeMetafile`, `initialize`,
 * and `stop`. Sync variants (e.g., `buildSync`, `transformSync`) are not
 * supported and throw errors.
 *
 * The `initialize()` function must be called before other API calls to load
 * the WebAssembly module.
 *
 * @see ./mod
 * @example
 * ```ts
 * import { initialize, build, stop } from "@ggpwnkthx/esbuild/wasm";
 *
 * await initialize({}); // wasmURL defaults to the bundled esbuild.wasm
 *
 * const result = await build({
 *   entryPoints: ["src/index.ts"],
 *   outfile: "dist/bundle.js",
 *   bundle: true,
 * });
 *
 * await stop();
 * ```
 */
import type * as types from "./shared/types.ts";
import * as common from "./shared/common.ts";
import * as ourselves from "./wasm.ts";
import { version } from "./mod.ts";

/** The esbuild binary version string (e.g. "0.28.0"). @see ../mod.ts */
export { version };

/**
 * @param options - Configuration options for the build.
 * @returns A promise that resolves with the build result or rejects with a `BuildFailure`.
 * @see ../shared/types.ts:build
 */
export const build: typeof types.build = (options: types.BuildOptions) =>
  ensureServiceIsRunning().then((service) => service.build(options));

/**
 * @param options - Configuration options for the build context.
 * @returns A promise that resolves with a `BuildContext` for long-running operations.
 * @see ../shared/types.ts:context
 */
export const context: typeof types.context = (options: types.BuildOptions) =>
  ensureServiceIsRunning().then((service) => service.context(options));

/**
 * @param input - The source code (string) or raw bytes to transform.
 * @param options - Optional transform configuration.
 * @returns A promise that resolves with the transform result or rejects with a `TransformFailure`.
 * @see ../shared/types.ts:transform
 */
export const transform: typeof types.transform = (
  input: string | Uint8Array,
  options?: types.TransformOptions,
) =>
  ensureServiceIsRunning().then((service) => service.transform(input, options));

/**
 * @param messages - An array of diagnostic messages to format.
 * @param options - Configuration for the formatter, including `kind` ("error" or "warning").
 * @returns A promise that resolves with an array of formatted message strings.
 * @see ../shared/types.ts:formatMessages
 */
export const formatMessages: typeof types.formatMessages = (
  messages,
  options,
) =>
  ensureServiceIsRunning().then((service) =>
    service.formatMessages(messages, options)
  );

/**
 * @param metafile - The metafile JSON string or object to analyze.
 * @param options - Optional analysis configuration.
 * @returns A promise that resolves with a human-readable analysis string.
 * @see ../shared/types.ts:analyzeMetafile
 */
export const analyzeMetafile: typeof types.analyzeMetafile = (
  metafile,
  options,
) =>
  ensureServiceIsRunning().then((service) =>
    service.analyzeMetafile(metafile, options)
  );

/**
 * Synchronous builds are not supported in the WASM API and throw unconditionally.
 * @throws Always throws an error indicating this API is unavailable in Deno.
 * @see ../shared/types.ts:buildSync
 */
export const buildSync: typeof types.buildSync = () => {
  throw new Error(`The "buildSync" API does not work in Deno`);
};

/**
 * Synchronous transforms are not supported in the WASM API and throw unconditionally.
 * @throws Always throws an error indicating this API is unavailable in Deno.
 * @see ../shared/types.ts:transformSync
 */
export const transformSync: typeof types.transformSync = () => {
  throw new Error(`The "transformSync" API does not work in Deno`);
};

/**
 * Synchronous message formatting is not supported in the WASM API and throws unconditionally.
 * @throws Always throws an error indicating this API is unavailable in Deno.
 * @see ../shared/types.ts:formatMessagesSync
 */
export const formatMessagesSync: typeof types.formatMessagesSync = () => {
  throw new Error(`The "formatMessagesSync" API does not work in Deno`);
};

/**
 * Synchronous metafile analysis is not supported in the WASM API and throws unconditionally.
 * @throws Always throws an error indicating this API is unavailable in Deno.
 * @see ../shared/types.ts:analyzeMetafileSync
 */
export const analyzeMetafileSync: typeof types.analyzeMetafileSync = () => {
  throw new Error(`The "analyzeMetafileSync" API does not work in Deno`);
};

/**
 * Terminates the esbuild WASM service and releases associated resources.
 *
 * In Deno, you must call this function when done using esbuild to prevent the
 * process from hanging indefinitely. The WASM worker is terminated and all
 * associated state is reset.
 *
 * @returns A promise that resolves when cleanup is complete.
 * @see ../shared/types.ts:stop
 */
export const stop = (): Promise<void> => {
  if (stopService) stopService();
  return Promise.resolve();
};

interface Service {
  build: typeof types.build;
  context: typeof types.context;
  transform: typeof types.transform;
  formatMessages: typeof types.formatMessages;
  analyzeMetafile: typeof types.analyzeMetafile;
}

let initializePromise: Promise<Service> | undefined;
let stopService: (() => void) | undefined;

const ensureServiceIsRunning = (): Promise<Service> => {
  return initializePromise ||
    startRunningService("bin/js/wasm/esbuild.wasm", undefined);
};

/**
 * Initializes the esbuild WASM service with the provided configuration.
 *
 * This function must be called before any other API calls. It loads the
 * WebAssembly module and starts a Deno Worker to run esbuild off the main
 * thread.
 *
 * The `options.worker` field is accepted for back-compat (still validated
 * as a boolean) but no longer toggles between code paths; the service always
 * runs in a worker.
 *
 * @param options - Configuration for the WASM service, including `wasmURL`
 *   (optional; defaults to the bundled `esbuild.wasm`) and `wasmModule`
 *   (optional pre-loaded module).
 * @returns A promise that resolves when initialization is complete.
 * @see ../shared/types.ts:initialize
 */
export const initialize: typeof types.initialize = async (options) => {
  options = common.validateInitializeOptions(options || {});
  if (initializePromise) {
    throw new Error('Cannot call "initialize" more than once');
  }
  const wasmURL = options.wasmURL || "bin/js/wasm/esbuild.wasm";
  const wasmModule = options.wasmModule;
  initializePromise = startRunningService(wasmURL, wasmModule);
  initializePromise.catch(() => {
    // Let the caller try again if this fails
    initializePromise = void 0;
  });
  await initializePromise;
};

const startRunningService = async (
  wasmURL: string | URL,
  wasmModule: WebAssembly.Module | undefined,
): Promise<Service> => {
  // Run esbuild in a Deno-spawned Web Worker. Deno 1.20+ supports importing
  // a module as a Worker via URL; this replaces the upstream bundler-based
  // pattern that required WEB_WORKER_SOURCE_CODE injection.
  const worker = new Worker(
    new URL("./shared/worker.ts", import.meta.url),
    { type: "module" },
  );

  let firstMessageResolve: (value: void) => void;
  // deno-lint-ignore no-explicit-any
  let firstMessageReject: (error: any) => void;

  const firstMessagePromise = new Promise<void>((resolve, reject) => {
    firstMessageResolve = resolve;
    firstMessageReject = reject;
  });

  // The worker posts `{ type: "ready" }` once its async setup (loading
  // `wasm_exec.js`, evaluating the Go runtime) is complete and its
  // `onmessage` listener is installed. Deno's module workers do not buffer
  // messages sent before that point, so we have to wait for the handshake
  // before sending the wasm URL.
  worker.onmessage = ({ data }) => {
    if (data?.type === "ready") {
      worker.onmessage = ({ data: error }) => {
        worker.onmessage = ({ data }) => readFromStdout(data);
        if (error) firstMessageReject(error);
        else firstMessageResolve();
      };
      worker.postMessage(
        wasmModule || new URL(wasmURL, import.meta.url).toString(),
      );
    }
  };

  const { readFromStdout, service } = common.createChannel({
    writeToStdin(bytes) {
      worker.postMessage(bytes);
    },
    isSync: false,
    hasFS: false,
    esbuild: ourselves,
  });

  // This will throw if WebAssembly module instantiation fails
  await firstMessagePromise;

  stopService = () => {
    worker.terminate();
    initializePromise = undefined;
    stopService = undefined;
  };

  return {
    build: (options: types.BuildOptions) =>
      new Promise<types.BuildResult>((resolve, reject) =>
        service.buildOrContext({
          callName: "build",
          refs: null,
          options,
          isTTY: false,
          defaultWD: "/",
          callback: (err, res) =>
            err ? reject(err) : resolve(res as types.BuildResult),
        })
      ),

    context: (options: types.BuildOptions) =>
      new Promise<types.BuildContext>((resolve, reject) =>
        service.buildOrContext({
          callName: "context",
          refs: null,
          options,
          isTTY: false,
          defaultWD: "/",
          callback: (err, res) =>
            err ? reject(err) : resolve(res as types.BuildContext),
        })
      ),

    transform: (input: string | Uint8Array, options?: types.TransformOptions) =>
      new Promise<types.TransformResult>((resolve, reject) =>
        service.transform({
          callName: "transform",
          refs: null,
          input,
          options: options || {},
          isTTY: false,
          fs: {
            readFile(_, callback) {
              callback(new Error("Internal error"), null);
            },
            writeFile(_, callback) {
              callback(null);
            },
          },
          callback: (err, res) => err ? reject(err) : resolve(res!),
        })
      ),

    formatMessages: (messages, options) =>
      new Promise((resolve, reject) =>
        service.formatMessages({
          callName: "formatMessages",
          refs: null,
          messages,
          options,
          callback: (err, res) => err ? reject(err) : resolve(res!),
        })
      ),

    analyzeMetafile: (metafile, options) =>
      new Promise((resolve, reject) =>
        service.analyzeMetafile({
          callName: "analyzeMetafile",
          refs: null,
          metafile: typeof metafile === "string"
            ? metafile
            : JSON.stringify(metafile),
          options,
          callback: (err, res) => err ? reject(err) : resolve(res!),
        })
      ),
  };
};
