/**
 * @module
 * Main entrypoint for the `@ggpwnkthx/esbuild` package, providing the full
 * esbuild JavaScript API for Deno with automatic binary management.
 *
 * The module selects the appropriate packaged esbuild binary for your platform,
 * verifies it against the generated manifest, copies it into a writable cache,
 * and executes the cached copy. All standard esbuild build functions are
 * available, including `build`, `context`, `transform`, and `formatMessages`.
 *
 * If the current `Deno.build.target` does not have a packaged native binary
 * (for example `x86_64-unknown-linux-musl` or `aarch64-unknown-linux-musl`),
 * the module automatically falls back to the bundled `esbuild.wasm` and uses
 * the same API as `./wasm`. The fallback is transparent for the async API
 * (`build`, `context`, `transform`, `formatMessages`, `analyzeMetafile`).
 * `initialize()` accepts `wasmURL`, `wasmModule`, and `worker` options in
 * this mode; in native mode these options are rejected. The CLI entry point
 * (`deno run -A jsr:@ggpwnkthx/esbuild --bundle ...`) is not available in
 * wasm mode — use the programmatic API.
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
import type * as types from "./shared/types.ts";
/** @see ../shared/types.ts:BuildOptions */
export type { BuildOptions } from "./shared/types.ts";
/** @see ../shared/types.ts:Loader */
export type { Loader } from "./shared/types.ts";
/** @see ../shared/types.ts:OnLoadArgs */
export type { OnLoadArgs } from "./shared/types.ts";
/** @see ../shared/types.ts:OnLoadResult */
export type { OnLoadResult } from "./shared/types.ts";
/** @see ../shared/types.ts:OnResolveArgs */
export type { OnResolveArgs } from "./shared/types.ts";
/** @see ../shared/types.ts:OnResolveResult */
export type { OnResolveResult } from "./shared/types.ts";
/** @see ../shared/types.ts:Platform */
export type { Platform } from "./shared/types.ts";
/** @see ../shared/types.ts:Plugin */
export type { Plugin } from "./shared/types.ts";
/** @see ../shared/types.ts:PluginBuild */
export type { PluginBuild } from "./shared/types.ts";
/** @see ../shared/types.ts:TransformOptions */
export type { TransformOptions } from "./shared/types.ts";
import binaryManifestJson from "./manifest.json" with { type: "json" };
import * as common from "./shared/common.ts";
import * as ourselves from "./mod.ts";
import * as wasm from "./wasm.ts";

/** The esbuild binary version string (e.g. "0.28.0").
 * @see https://github.com/evanw/esbuild/releases */
export const version = common.ESBUILD_VERSION;

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
export const build: typeof types.build = (options: types.BuildOptions) => {
  if (useWasm) return wasm.build(options);
  return ensureServiceIsRunning().then((service) => service.build(options));
};

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
export const context: typeof types.context = (options: types.BuildOptions) => {
  if (useWasm) return wasm.context(options);
  return ensureServiceIsRunning().then((service) => service.context(options));
};

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
) => {
  if (useWasm) return wasm.transform(input, options);
  return ensureServiceIsRunning().then((service) =>
    service.transform(input, options)
  );
};

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
) => {
  if (useWasm) return wasm.formatMessages(messages, options);
  return ensureServiceIsRunning().then((service) =>
    service.formatMessages(messages, options)
  );
};

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
) => {
  if (useWasm) return wasm.analyzeMetafile(metafile, options);
  return ensureServiceIsRunning().then((service) =>
    service.analyzeMetafile(metafile, options)
  );
};

/** @see ../shared/types.ts:buildSync
 * @example
 * ```ts
 * // Throws: The "buildSync" API does not work in Deno
 * buildSync({ entryPoints: ["src/index.ts"] });
 * ```
 */
export const buildSync: typeof types.buildSync = () => {
  throw new Error(`The "buildSync" API does not work in Deno`);
};

/** @see ../shared/types.ts:transformSync
 * @example
 * ```ts
 * // Throws: The "transformSync" API does not work in Deno
 * transformSync("const x: number = 1;", { loader: "ts" });
 * ```
 */
export const transformSync: typeof types.transformSync = () => {
  throw new Error(`The "transformSync" API does not work in Deno`);
};

/** @see ../shared/types.ts:formatMessagesSync
 * @example
 * ```ts
 * // Throws: The "formatMessagesSync" API does not work in Deno
 * formatMessagesSync([{ text: "error" }], { kind: "error" });
 * ```
 */
export const formatMessagesSync: typeof types.formatMessagesSync = () => {
  throw new Error(`The "formatMessagesSync" API does not work in Deno`);
};

/** @see ../shared/types.ts:analyzeMetafileSync
 * @example
 * ```ts
 * // Throws: The "analyzeMetafileSync" API does not work in Deno
 * analyzeMetafileSync("{ inputs: {} }", {});
 * ```
 */
export const analyzeMetafileSync: typeof types.analyzeMetafileSync = () => {
  throw new Error(`The "analyzeMetafileSync" API does not work in Deno`);
};

/** @see ../shared/types.ts:stop
 * @example
 * ```ts
 * // ... use esbuild ...
 * await stop(); // prevents hang
 * ```
 */
export const stop = async (): Promise<void> => {
  if (useWasm) return wasm.stop();
  if (stopService) await stopService();
};

let initializeWasCalled = false;

/** @see ../shared/types.ts:initialize
 * @example
 * ```ts
 * // Pre-initialize the esbuild service before first use
 * await initialize({});
 * ```
 */
export const initialize: typeof types.initialize = async (options) => {
  options = common.validateInitializeOptions(options || {});
  if (useWasm) {
    return wasm.initialize(options);
  }
  if (options.wasmURL) {
    throw new Error(`The "wasmURL" option only works in the browser`);
  }
  if (options.wasmModule) {
    throw new Error(`The "wasmModule" option only works in the browser`);
  }
  if (options.worker) {
    throw new Error(`The "worker" option only works in the browser`);
  }
  if (initializeWasCalled) {
    throw new Error('Cannot call "initialize" more than once');
  }
  await ensureServiceIsRunning();
  initializeWasCalled = true;
};

interface BinaryManifestEntry {
  readonly denoTarget: string;
  readonly slug: string;
  readonly executableName: string;
  readonly executablePath: string;
  readonly sha256: string;
}

interface BinaryManifest {
  readonly esbuildVersion: string;
  readonly binaries: readonly BinaryManifestEntry[];
}

const binaryManifest = binaryManifestJson as BinaryManifest;

function findNativeBinary(): BinaryManifestEntry | undefined {
  if (binaryManifest.esbuildVersion !== version) {
    throw new Error(
      `Invalid esbuild package: manifest version "${binaryManifest.esbuildVersion}" does not match host version "${version}"`,
    );
  }

  return binaryManifest.binaries.find((entry) =>
    entry.denoTarget === Deno.build.target
  );
}

function selectPackagedBinary(): BinaryManifestEntry {
  const binary = findNativeBinary();
  if (!binary) throw new Error(`Unsupported platform: ${Deno.build.target}`);
  return binary;
}

const nativeBinary = findNativeBinary();
const useWasm = nativeBinary === undefined;

async function install(): Promise<string> {
  const overridePath = Deno.env.get("ESBUILD_BINARY_PATH");
  if (overridePath) return overridePath;

  const binary = selectPackagedBinary();
  const { finalPath, finalDir } = getCachePath(binary);

  try {
    const cached = await Deno.readFile(finalPath);
    const cachedHash = await sha256(cached);
    if (cachedHash === binary.sha256) {
      if (Deno.build.os !== "windows") await Deno.chmod(finalPath, 0o755);
      return finalPath;
    }
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) throw err;
  }

  const packagedBinaryURL = new URL(binary.executablePath, import.meta.url);
  const packagedBinary = await Deno.readFile(packagedBinaryURL);
  const packagedHash = await sha256(packagedBinary);
  if (packagedHash !== binary.sha256) {
    throw new Error(
      `Invalid esbuild binary ${JSON.stringify(binary.executablePath)
      }: expected SHA-256 ${binary.sha256}, got ${packagedHash}`,
    );
  }

  await Deno.mkdir(finalDir, { recursive: true, mode: 0o700 });
  await Deno.writeFile(finalPath, packagedBinary, { mode: 0o755 });
  if (Deno.build.os !== "windows") await Deno.chmod(finalPath, 0o755);

  return finalPath;
}

function getCachePath(
  binary: BinaryManifestEntry,
): { finalPath: string; finalDir: string } {
  let baseDir: string | undefined;

  switch (Deno.build.os) {
    case "darwin":
      baseDir = Deno.env.get("HOME");
      if (baseDir) baseDir += "/Library/Caches";
      break;

    case "windows":
      baseDir = Deno.env.get("LOCALAPPDATA");
      if (!baseDir) {
        baseDir = Deno.env.get("USERPROFILE");
        if (baseDir) baseDir += "/AppData/Local";
      }
      if (baseDir) baseDir += "/Cache";
      break;

    case "linux": {
      // https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html
      const xdg = Deno.env.get("XDG_CACHE_HOME");
      if (xdg && xdg[0] === "/") baseDir = xdg;
      break;
    }
  }

  if (!baseDir) {
    baseDir = Deno.env.get("HOME");
    if (baseDir) baseDir += "/.cache";
  }

  if (!baseDir) throw new Error("Failed to find cache directory");

  const finalDir = baseDir + "/esbuild/bin";
  const slug = binary.slug.replaceAll("/", "-");
  const executableSuffix = binary.executableName.endsWith(".exe") ? ".exe" : "";
  const finalPath = `${finalDir}/esbuild-${slug}@${version}${executableSuffix}`;
  return { finalPath, finalDir };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digestBytes: Uint8Array<ArrayBuffer> = new Uint8Array(bytes);
  const hash = await crypto.subtle.digest("SHA-256", digestBytes);
  return Array.from(
    new Uint8Array(hash),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

interface Service {
  build: typeof types.build;
  context: typeof types.context;
  transform: typeof types.transform;
  formatMessages: typeof types.formatMessages;
  analyzeMetafile: typeof types.analyzeMetafile;
}

const defaultWD = Deno.cwd();
let longLivedService: Promise<Service> | undefined;
let stopService: (() => Promise<void>) | undefined;

// Declare a common subprocess API for the two implementations below
type SpawnFn = (cmd: string, options: {
  args: string[];
  stdin: "piped" | "inherit";
  stdout: "piped" | "inherit";
  stderr: "inherit";
}) => {
  write(bytes: Uint8Array): void;
  read(): Promise<Uint8Array | null>;
  close(): Promise<void> | void;
  status(): Promise<{ code: number }>;
};

// Deno ≥1.40
const spawnNew: SpawnFn = (cmd, { args, stdin, stdout, stderr }) => {
  const child = new Deno.Command(cmd, {
    args,
    cwd: defaultWD,
    stdin,
    stdout,
    stderr,
  }).spawn();
  // Note: Need to check for "piped" in Deno ≥1.31.0 to avoid a crash
  const writer = stdin === "piped" ? child.stdin.getWriter() : null;
  const reader = stdout === "piped" ? child.stdout.getReader() : null;
  return {
    write: writer ? (bytes) => writer.write(bytes) : () => Promise.resolve(),
    read: reader
      ? () => reader.read().then((x) => x.value || null)
      : () => Promise.resolve(null),
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
      if (writer) await writer.close();
      if (reader) await reader.cancel();

      // Wait for the process to exit. The new "kill()" API doesn't flag the
      // process as having exited because processes can technically ignore the
      // kill signal. Without this, Deno will fail tests that use esbuild with
      // an error because the test spawned a process but didn't wait for it.
      await child.status;
    },
    status: () => child.status,
  };
};

// Rely on spawnNew (Deno.Command) for all supported Deno versions
const spawn: SpawnFn = spawnNew;

const ensureServiceIsRunning = (): Promise<Service> => {
  if (!longLivedService) {
    longLivedService = (async (): Promise<Service> => {
      const binPath = await install();
      const isTTY = Deno.stderr.isTerminal ? Deno.stderr.isTerminal() : false;

      const child = spawn(binPath, {
        args: [`--service=${version}`],
        stdin: "piped",
        stdout: "piped",
        stderr: "inherit",
      });

      stopService = async () => {
        // Close all resources related to the subprocess.
        await child.close();
        initializeWasCalled = false;
        longLivedService = undefined;
        stopService = undefined;
      };

      const { readFromStdout, afterClose, service } = common.createChannel({
        writeToStdin(bytes) {
          child.write(bytes);
        },
        isSync: false,
        hasFS: true,
        esbuild: ourselves,
      });

      const readMoreStdout = () =>
        child.read().then((buffer) => {
          if (buffer === null) {
            afterClose(null);
          } else {
            readFromStdout(buffer);
            readMoreStdout();
          }
        }).catch((e) => {
          if (
            e instanceof Deno.errors.Interrupted ||
            e instanceof Deno.errors.BadResource
          ) {
            // ignore the error if read was interrupted (stdout was closed)
            afterClose(e);
          } else {
            throw e;
          }
        });
      readMoreStdout();

      return {
        build: (options: types.BuildOptions) =>
          new Promise<types.BuildResult>((resolve, reject) => {
            service.buildOrContext({
              callName: "build",
              refs: null,
              options,
              isTTY,
              defaultWD,
              callback: (err, res) =>
                err ? reject(err) : resolve(res as types.BuildResult),
            });
          }),

        context: (options: types.BuildOptions) =>
          new Promise<types.BuildContext>((resolve, reject) =>
            service.buildOrContext({
              callName: "context",
              refs: null,
              options,
              isTTY,
              defaultWD,
              callback: (err, res) =>
                err ? reject(err) : resolve(res as types.BuildContext),
            })
          ),

        transform: (
          input: string | Uint8Array,
          options?: types.TransformOptions,
        ) =>
          new Promise<types.TransformResult>((resolve, reject) =>
            service.transform({
              callName: "transform",
              refs: null,
              input,
              options: options || {},
              isTTY,
              fs: {
                readFile(tempFile, callback) {
                  Deno.readFile(tempFile).then(
                    (bytes) => {
                      const text = new TextDecoder().decode(bytes);
                      try {
                        Deno.remove(tempFile);
                      } catch (_e) {
                        // Ignore error
                      }
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
                      ).then(
                        () => callback(tempFile),
                        () => callback(null),
                      ),
                    () => callback(null),
                  );
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
    })();
  }
  return longLivedService;
};

// If we're called as the main script, forward the CLI to the underlying executable
if (import.meta.main) {
  if (useWasm) {
    console.error(
      "esbuild CLI is not available in wasm mode: " +
      `no native binary for Deno.build.target=${Deno.build.target}. ` +
      "Use the programmatic API (e.g. `await build(...)`) on a platform with a native binary, " +
      "or import from `@ggpwnkthx/esbuild/wasm` directly.",
    );
    Deno.exit(1);
  }
  spawn(await install(), {
    args: Deno.args,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).status().then(({ code }) => {
    Deno.exit(code);
  });
}
