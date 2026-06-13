/**
 * @module
 * Browser/WASM entrypoint for the `@ggpwnkthx/esbuild` package, providing the
 * same async API as mod.ts but using the WebAssembly version of esbuild running
 * in a browser worker by default.
 *
 * All standard esbuild build functions are available, including `build`,
 * `context`, `transform`, `formatMessages`, `analyzeMetafile`, `initialize`,
 * and `stop`. Sync variants (e.g., `buildSync`, `transformSync`) are not
 * supported and throw errors.
 *
 * The `initialize()` function must be called before other API calls in the
 * browser to load the WebAssembly module.
 *
 * @see ./mod
 * @example
 * ```ts
 * import { initialize, build } from "@ggpwnkthx/esbuild/wasm";
 *
 * await initialize({
 *   worker: true,
 *   wasmURL: new URL("./esbuild.wasm", import.meta.url),
 * });
 *
 * const result = await build({
 *   entryPoints: ["src/index.ts"],
 *   outfile: "dist/bundle.js",
 *   bundle: true,
 * });
 * ```
 */
import type * as types from "./shared/types.ts";
import type {
  GoWasmRuntimeHandle,
  WorkerInputMessage,
} from "./shared/worker.ts";
import * as common from "./shared/common.ts";
import * as ourselves from "./wasm.ts";
import { version } from "./mod.ts";

interface WorkerMessageEvent {
  readonly data: unknown;
}

interface WorkerLike {
  postMessage(message: WorkerInputMessage): void;
  terminate(): void;
  onmessage: ((event: WorkerMessageEvent) => void) | null;
  onerror?: ((event: ErrorEvent) => void) | null;
}

/** The esbuild binary version string (e.g. "0.28.1"). @see ../mod.ts */
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
    startRunningService("esbuild.wasm", undefined, true);
};

/**
 * Initializes the esbuild WASM service with the provided configuration.
 *
 * This function must be called before any other API calls in browser environments.
 * It loads the WebAssembly module and (by default) starts a web worker to run
 * esbuild off the main thread.
 *
 * @param options - Configuration for the WASM service, including `wasmURL` (required
 *   in browsers), `wasmModule` (optional pre-loaded module), and `worker` (whether
 *   to run in a worker, default true).
 * @returns A promise that resolves when initialization is complete.
 * @see ../shared/types.ts:initialize
 */
export const initialize: typeof types.initialize = async (options) => {
  options = common.validateInitializeOptions(options || {});
  const wasmURL = options.wasmURL;
  const wasmModule = options.wasmModule;
  const useWorker = options.worker !== false;
  if (initializePromise) {
    throw new Error('Cannot call "initialize" more than once');
  }
  initializePromise = startRunningService(
    wasmURL || "esbuild.wasm",
    wasmModule,
    useWorker,
  );
  initializePromise.catch(() => {
    // Let the caller try again if this fails
    initializePromise = void 0;
  });
  await initializePromise;
};

const startRunningService = async (
  wasmURL: string | URL,
  wasmModule: WebAssembly.Module | undefined,
  useWorker: boolean,
): Promise<Service> => {
  let worker: WorkerLike;

  if (useWorker) {
    // Run esbuild off the main thread.
    const nativeWorker = new Worker(
      new URL("./shared/worker.ts", import.meta.url).href,
      { type: "module" },
    );

    const workerAdapter: WorkerLike = {
      onmessage: null,
      onerror: null,

      postMessage(message) {
        nativeWorker.postMessage(message);
      },

      terminate() {
        nativeWorker.terminate();
      },
    };

    nativeWorker.onmessage = (event: MessageEvent<unknown>) => {
      workerAdapter.onmessage?.({ data: event.data });
    };

    nativeWorker.onerror = (event: ErrorEvent) => {
      workerAdapter.onerror?.(event);
    };

    worker = workerAdapter;
  } else {
    // Run esbuild on the current thread.
    const { createWorkerMessageHandler } = await import("./shared/worker.ts");
    let go: GoWasmRuntimeHandle | undefined;
    const onmessage = createWorkerMessageHandler((data) => {
      worker.onmessage?.({ data });
    });

    worker = {
      onmessage: null,
      postMessage: (data) => {
        setTimeout(() => {
          go = onmessage({ data });
        });
      },
      terminate() {
        if (!go) return;
        for (const timeout of go._scheduledTimeouts.values()) {
          clearTimeout(timeout);
        }
      },
    };
  }

  let firstMessageResolve!: () => void;
  let firstMessageReject!: (error: Error) => void;

  const firstMessagePromise = new Promise<void>((resolve, reject) => {
    firstMessageResolve = resolve;
    firstMessageReject = reject;
  });

  worker.onmessage = ({ data: error }) => {
    worker.onmessage = ({ data }) => {
      if (data instanceof Uint8Array) {
        readFromStdout(data);
      } else if (data instanceof ArrayBuffer) {
        readFromStdout(new Uint8Array(data));
      } else {
        throw new Error("Expected stdout data to be a Uint8Array");
      }
    };

    if (error) firstMessageReject(toError(error));
    else firstMessageResolve();
  };

  worker.postMessage(
    wasmModule || new URL(wasmURL, import.meta.url).toString(),
  );

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

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
