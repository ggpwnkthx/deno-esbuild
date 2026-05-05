/**
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
import * as common from "./shared/common.ts";
import * as ourselves from "./wasm.ts";
import { version } from "./mod.ts";

interface Go {
  _scheduledTimeouts: Map<number, ReturnType<typeof setTimeout>>;
}

declare let WEB_WORKER_SOURCE_CODE: string;
declare let WEB_WORKER_FUNCTION: (
  postMessage: (data: Uint8Array) => void,
) => (event: { data: Uint8Array | ArrayBuffer | WebAssembly.Module }) => Go;

/** The esbuild binary version string (e.g. "0.28.0"). @see ../mod.ts */
export { version };

/** @see ../shared/types.ts:build */
export const build: typeof types.build = (options: types.BuildOptions) =>
  ensureServiceIsRunning().then((service) => service.build(options));

/** @see ../shared/types.ts:context */
export const context: typeof types.context = (options: types.BuildOptions) =>
  ensureServiceIsRunning().then((service) => service.context(options));

/** @see ../shared/types.ts:transform */
export const transform: typeof types.transform = (
  input: string | Uint8Array,
  options?: types.TransformOptions,
) =>
  ensureServiceIsRunning().then((service) => service.transform(input, options));

/** @see ../shared/types.ts:formatMessages */
export const formatMessages: typeof types.formatMessages = (
  messages,
  options,
) =>
  ensureServiceIsRunning().then((service) =>
    service.formatMessages(messages, options)
  );

/** @see ../shared/types.ts:analyzeMetafile */
export const analyzeMetafile: typeof types.analyzeMetafile = (
  metafile,
  options,
) =>
  ensureServiceIsRunning().then((service) =>
    service.analyzeMetafile(metafile, options)
  );

/** @see ../shared/types.ts:buildSync */
export const buildSync: typeof types.buildSync = () => {
  throw new Error(`The "buildSync" API does not work in Deno`);
};

/** @see ../shared/types.ts:transformSync */
export const transformSync: typeof types.transformSync = () => {
  throw new Error(`The "transformSync" API does not work in Deno`);
};

/** @see ../shared/types.ts:formatMessagesSync */
export const formatMessagesSync: typeof types.formatMessagesSync = () => {
  throw new Error(`The "formatMessagesSync" API does not work in Deno`);
};

/** @see ../shared/types.ts:analyzeMetafileSync */
export const analyzeMetafileSync: typeof types.analyzeMetafileSync = () => {
  throw new Error(`The "analyzeMetafileSync" API does not work in Deno`);
};

/** @see ../shared/types.ts:stop */
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

/** @see ../shared/types.ts:initialize */
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
  let worker: {
    // deno-lint-ignore no-explicit-any
    onmessage?: ((event: any) => void) | null | undefined;
    postMessage: (data: Uint8Array | ArrayBuffer | WebAssembly.Module) => void;
    terminate: () => void;
  };

  if (useWorker) {
    // Run esbuild off the main thread
    const blob = new Blob(
      [`onmessage=${WEB_WORKER_SOURCE_CODE}(postMessage)`],
      {
        type: "text/javascript",
      },
    );
    worker = new Worker(URL.createObjectURL(blob), { type: "module" });
  } else {
    // Run esbuild on the main thread
    const onmessage = WEB_WORKER_FUNCTION((data: Uint8Array) =>
      worker.onmessage!({ data })
    );
    let go: Go | undefined;
    worker = {
      onmessage: null,
      postMessage: (data) => setTimeout(() => go = onmessage({ data })),
      terminate() {
        if (go) {
          for (const timeout of go._scheduledTimeouts.values()) {
            clearTimeout(timeout);
          }
        }
      },
    };
  }

  let firstMessageResolve: (value: void) => void;
  // deno-lint-ignore no-explicit-any
  let firstMessageReject: (error: any) => void;

  const firstMessagePromise = new Promise((resolve, reject) => {
    firstMessageResolve = resolve;
    firstMessageReject = reject;
  });

  worker.onmessage = ({ data: error }) => {
    worker.onmessage = ({ data }) => readFromStdout(data);
    if (error) firstMessageReject(error);
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
