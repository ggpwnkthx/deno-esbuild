import type {
  AnalyzeMetafileOptions,
  BuildContext,
  BuildOptions,
  BuildResult,
  FormatMessagesOptions,
  InitializeOptions,
  Metafile,
  PartialMessage,
  TransformOptions,
  TransformResult,
} from "./types.ts";
import { createChannel, type EsbuildExports } from "./utils/channel.ts";
import { validateInitializeOptions } from "./utils/validation.ts";
import { getModVersion, getVersion, install } from "./install.ts";

/**
 * The version of the esbuild API.
 */
export { getVersion as version };

/**
 * Builds files and/or directories of files using the esbuild API.
 *
 * @example
 * ```typescript
 * await build({
 *   entryPoints: ["src/index.ts"],
 *   bundle: true,
 *   outfile: "dist/bundle.js",
 * });
 * ```
 */
export function build<Options extends BuildOptions>(
  options: Options,
): Promise<BuildResult<Options>> {
  return ensureServiceIsRunning().then((service) =>
    service.build(options) as Promise<BuildResult<Options>>
  );
}

/**
 * Creates a build context that can be used to run builds repeatedly or to watch
 * the file system for changes.
 *
 * @example
 * ```typescript
 * const ctx = await context({
 *   entryPoints: ["src/index.ts"],
 *   bundle: true,
 * });
 * await ctx.watch();
 * ```
 */
export function context<Options extends BuildOptions>(
  options: Options,
): Promise<BuildContext<Options>> {
  return ensureServiceIsRunning().then((service) =>
    service.context(options) as Promise<BuildContext<Options>>
  );
}

/**
 * Transforms a string of JavaScript or TypeScript code into JavaScript code.
 *
 * @example
 * ```typescript
 * const result = await transform("const x: number = 1;", {
 *   loader: "ts",
 * });
 * ```
 */
export function transform<Options extends TransformOptions>(
  input: string | Uint8Array,
  options?: Options,
): Promise<TransformResult<Options>> {
  return ensureServiceIsRunning().then((service) =>
    service.transform(input, options as TransformOptions) as Promise<
      TransformResult<Options>
    >
  );
}

/**
 * Formats an array of esbuild log messages into a human-readable string.
 */
export const formatMessages = (
  messages: PartialMessage[],
  options: FormatMessagesOptions,
): Promise<string[]> =>
  ensureServiceIsRunning().then((service) => service.formatMessages(messages, options));

/**
 * Analyzes a metafile output by esbuild and returns a human-readable string.
 */
export const analyzeMetafile = (
  metafile: Metafile | string,
  options?: AnalyzeMetafileOptions,
): Promise<string> =>
  ensureServiceIsRunning().then((service) =>
    service.analyzeMetafile(
      typeof metafile === "string" ? metafile : JSON.stringify(metafile),
      options,
    )
  );

/**
 * The synchronous version of `build`.
 *
 * This API is not supported in Deno as it requires a native binary that
 * does not support synchronous operations. Use the asynchronous `build`
 * function instead.
 */
export const buildSync = (): BuildResult => {
  throw new Error(`The "buildSync" API does not work in Deno`);
};

/**
 * The synchronous version of `transform`.
 *
 * This API is not supported in Deno as it requires a native binary that
 * does not support synchronous operations. Use the asynchronous `transform`
 * function instead.
 */
export const transformSync = (): TransformResult => {
  throw new Error(`The "transformSync" API does not work in Deno`);
};

/**
 * The synchronous version of `formatMessages`.
 *
 * This API is not supported in Deno as it requires a native binary that
 * does not support synchronous operations. Use the asynchronous `formatMessages`
 * function instead.
 */
export const formatMessagesSync = (): string[] => {
  throw new Error(`The "formatMessagesSync" API does not work in Deno`);
};

/**
 * The synchronous version of `analyzeMetafile`.
 *
 * This API is not supported in Deno as it requires a native binary that
 * does not support synchronous operations. Use the asynchronous `analyzeMetafile`
 * function instead.
 */
export const analyzeMetafileSync = (): string => {
  throw new Error(`The "analyzeMetafileSync" API does not work in Deno`);
};

/**
 * Stops the esbuild service, releasing any resources it holds.
 */
export const stop = async (): Promise<void> => {
  if (stopService) await stopService();
};

let initializeWasCalled = false;

/**
 * Initializes the esbuild service with the given options.
 *
 * This function is called automatically by other API methods. You typically
 * do not need to call it explicitly unless you want to validate options
 * before performing any builds.
 *
 * @throws Error If called more than once, or if browser-only options are provided.
 */
export const initialize = async (options: InitializeOptions): Promise<void> => {
  const validated = validateInitializeOptions(options);
  if (validated.wasmURL) {
    throw new Error(`The "wasmURL" option only works in the browser`);
  }
  if (validated.wasmModule) {
    throw new Error(`The "wasmModule" option only works in the browser`);
  }
  if (validated.worker) {
    throw new Error(`The "worker" option only works in the browser`);
  }
  if (initializeWasCalled) {
    throw new Error('Cannot call "initialize" more than once');
  }
  await ensureServiceIsRunning();
  initializeWasCalled = true;
};

const defaultWD = Deno.cwd();
let longLivedService:
  | Promise<{
    build: (options: BuildOptions) => Promise<BuildResult>;
    context: (options: BuildOptions) => Promise<BuildContext>;
    transform: (
      input: string | Uint8Array,
      options?: TransformOptions,
    ) => Promise<TransformResult>;
    formatMessages: (
      messages: PartialMessage[],
      options: FormatMessagesOptions,
    ) => Promise<string[]>;
    analyzeMetafile: (
      metafile: Metafile | string,
      options?: AnalyzeMetafileOptions,
    ) => Promise<string>;
  }>
  | undefined;
let stopService: (() => Promise<void>) | undefined;

interface Child {
  write: (bytes: Uint8Array) => Promise<void>;
  read: () => Promise<Uint8Array | null>;
  close: () => Promise<void>;
  status: () => Promise<{ code: number }>;
}

const spawnNew = (
  cmd: string,
  opts: {
    args: string[];
    stdin: "piped" | "inherit";
    stdout: "piped" | "inherit";
    stderr: "inherit";
  },
): Child => {
  const child = new Deno.Command(cmd, {
    args: opts.args,
    cwd: defaultWD,
    stdin: opts.stdin,
    stdout: opts.stdout,
    stderr: opts.stderr,
  }).spawn();

  const writer = opts.stdin === "piped" ? child.stdin.getWriter() : null;
  const reader = opts.stdout === "piped" ? child.stdout.getReader() : null;

  return {
    write: writer
      ? (bytes: Uint8Array) => writer.write(bytes)
      : () => Promise.resolve(),
    read: reader
      ? () => reader.read().then((x) => x.value || null)
      : () => Promise.resolve(null),
    close: async () => {
      if (writer) await writer.close();
      if (reader) await reader.cancel();
      await child.status;
    },
    status: () => child.status,
  };
};

const spawn = spawnNew;

/**
 * Ensures the esbuild service is running and returns a promise that resolves
 * to the service API.
 *
 * This function is called automatically by other API methods. It handles
 * installing the esbuild binary if needed and spawning the service process.
 */
export const ensureServiceIsRunning = (): Promise<{
  build: (options: BuildOptions) => Promise<BuildResult>;
  context: (options: BuildOptions) => Promise<BuildContext>;
  transform: (
    input: string | Uint8Array,
    options?: TransformOptions,
  ) => Promise<TransformResult>;
  formatMessages: (
    messages: PartialMessage[],
    options: FormatMessagesOptions,
  ) => Promise<string[]>;
  analyzeMetafile: (
    metafile: Metafile | string,
    options?: AnalyzeMetafileOptions,
  ) => Promise<string>;
}> => {
  if (!longLivedService) {
    longLivedService = (async () => {
      const version = await getModVersion();
      const binPath = await install();
      const isTTY = Deno.stderr.isTerminal();

      const child = spawn(binPath, {
        args: [`--service=${version}`],
        stdin: "piped",
        stdout: "piped",
        stderr: "inherit",
      });

      stopService = async () => {
        await child.close();
        initializeWasCalled = false;
        longLivedService = undefined;
        stopService = undefined;
      };

      const mod_exports: EsbuildExports = {
        analyzeMetafile,
        analyzeMetafileSync,
        build,
        buildSync,
        context,
        formatMessages,
        formatMessagesSync,
        initialize,
        stop,
        transform,
        transformSync,
        version,
      };

      const { readFromStdout, afterClose, service } = createChannel({
        writeToStdin(bytes: Uint8Array) {
          child.write(bytes);
        },
        isSync: false,
        hasFS: true,
        esbuild: mod_exports,
      }, version);

      const readMoreStdout = (): void => {
        child.read().then((buffer) => {
          if (buffer === null) {
            afterClose(undefined);
          } else {
            readFromStdout(buffer);
            readMoreStdout();
          }
        }).catch((e) => {
          if (
            e instanceof Deno.errors.Interrupted || e instanceof Deno.errors.BadResource
          ) {
            afterClose(e);
          } else {
            throw e;
          }
        });
      };

      readMoreStdout();

      return {
        build: (options) =>
          new Promise((resolve, reject) => {
            service.buildOrContext({
              callName: "build",
              refs: null,
              options: options as Record<string, unknown>,
              isTTY,
              defaultWD,
              callback: (err, res) => err ? reject(err) : resolve(res as BuildResult),
            });
          }),
        context: (options) =>
          new Promise((resolve, reject) =>
            service.buildOrContext({
              callName: "context",
              refs: null,
              options: options as Record<string, unknown>,
              isTTY,
              defaultWD,
              callback: (err, res) => err ? reject(err) : resolve(res as BuildContext),
            })
          ),
        transform: (input, options) =>
          new Promise((resolve, reject) =>
            service.transform({
              callName: "transform",
              refs: null,
              input,
              options: (options || {}) as Record<string, unknown>,
              isTTY,
              fs: {
                readFile(tempFile, callback) {
                  Deno.readFile(tempFile).then(
                    (bytes) => {
                      const text = new TextDecoder().decode(bytes);
                      Deno.remove(tempFile).catch(() => {
                        // Ignore cleanup errors
                      });
                      callback(null, text);
                    },
                    (err) => callback(err, null),
                  );
                },
                writeFile(contents, callback) {
                  Deno.makeTempFile().then(
                    (tempFile) =>
                      Deno.writeFile(
                        tempFile,
                        typeof contents === "string"
                          ? new TextEncoder().encode(contents)
                          : contents,
                      ).then(() => callback(tempFile), () => callback(null)),
                    () => callback(null),
                  );
                },
              },
              callback: (err, res) =>
                err ? reject(err) : resolve(res as TransformResult),
            })
          ),
        formatMessages: (messages, options) =>
          new Promise((resolve, reject) =>
            service.formatMessages({
              callName: "formatMessages",
              refs: null,
              messages,
              options,
              callback: (err, res) => err ? reject(err) : resolve(res as string[]),
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
              callback: (err, res) => err ? reject(err) : resolve(res as string),
            })
          ),
      };
    })();
  }

  return longLivedService;
};

if (import.meta.main) {
  spawn(await install(), {
    args: Deno.args,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).status().then(({ code }) => {
    Deno.exit(code);
  });
}
