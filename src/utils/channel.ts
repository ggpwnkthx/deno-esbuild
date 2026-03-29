import type {
  AnalyzeMetafileOptions,
  BuildContext,
  BuildOptions,
  BuildResult,
  FormatMessagesOptions,
  ImportKind,
  InitializeOptions,
  Location as BuildLocation,
  Message,
  OnEndResult,
  OnLoadArgs,
  OnLoadResult,
  OnResolveArgs,
  OnResolveResult,
  OnStartResult,
  PartialMessage,
  PluginBuild,
  ResolveOptions,
  ResolveResult,
  ServeOnRequestArgs,
  ServeOptions,
  ServeResult,
  TransformOptions,
  TransformResult,
  WatchOptions,
} from "../types.ts";
import { getVersion } from "../install.ts";
import { decodePacket, encodePacket } from "./byte-buffer.ts";
import { decodeUTF8, encodeUTF8, JSON_parse } from "./codec.ts";
import {
  buildLogLevelDefault,
  flagsForBuildOptions,
  flagsForTransformOptions,
  transformLogLevelDefault,
} from "./flags.ts";
import {
  canBeAnything,
  checkForInvalidFlags,
  getFlag,
  jsRegExpToGoRegExp,
  mustBeArray,
  mustBeArrayOfStrings,
  mustBeBoolean,
  mustBeFunction,
  mustBeInteger,
  mustBeObject,
  mustBeRegExp,
  mustBeString,
  mustBeStringOrArrayOfStrings,
  mustBeStringOrUint8Array,
  sanitizeStringArray,
  sanitizeStringMap,
} from "./validation.ts";
import {
  convertOutputFiles,
  createObjectStash,
  extractCallerV8,
  extractErrorMessageV8,
  failureErrorWithLog,
  replaceDetailsInMessages,
  sanitizeMessages,
} from "./misc.ts";

const quote = JSON.stringify;

function isRecordOfMessages(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.errors)
    && Array.isArray(record.warnings)
    && record.errors.every((e: unknown) =>
      typeof e === "object" && e !== null && "text" in e
    )
    && record.warnings.every((e: unknown) =>
      typeof e === "object" && e !== null && "text" in e
    )
  );
}

function asBuildResult(value: unknown): BuildResult<BuildOptions> {
  if (!isRecordOfMessages(value)) {
    throw new Error("Invalid build result: missing errors or warnings array");
  }
  return value as BuildResult<BuildOptions>;
}

/**
 * The subset of the esbuild API exposed to plugins running in the esbuild
 * service process.
 */
export interface EsbuildExports {
  context: (options: BuildOptions) => Promise<BuildContext>;
  build: (options: BuildOptions) => Promise<BuildResult>;
  buildSync: () => BuildResult;
  transform: (
    input: string | Uint8Array,
    options?: TransformOptions,
  ) => Promise<TransformResult>;
  transformSync: () => TransformResult;
  formatMessages: (
    messages: PartialMessage[],
    options: FormatMessagesOptions,
  ) => Promise<string[]>;
  formatMessagesSync: () => string[];
  analyzeMetafile: (
    metafile: string,
    options?: AnalyzeMetafileOptions,
  ) => Promise<string>;
  analyzeMetafileSync: () => string;
  initialize: (options: InitializeOptions) => Promise<void>;
  stop: () => void | Promise<void>;
  version: string;
}

interface StreamIn {
  writeToStdin(bytes: Uint8Array): void;
  isSync: boolean;
  hasFS: boolean;
  readFileSync?: (path: string, encoding: string) => string;
  esbuild: EsbuildExports;
}

interface ChannelResult {
  readFromStdout: (chunk: Uint8Array) => void;
  afterClose: (error?: Error) => void;
  waitForClose: () => Promise<void>;
  service: {
    buildOrContext: (params: {
      callName: string;
      refs: unknown;
      options: Record<string, unknown> | undefined;
      isTTY: boolean;
      defaultWD: string;
      callback: (
        err: Error | null,
        res: unknown,
        onEndErrors?: Message[],
        onEndWarnings?: Message[],
      ) => void;
    }) => void;
    transform: (params: {
      callName: string;
      refs: unknown;
      input: string | Uint8Array;
      options: Record<string, unknown>;
      isTTY: boolean;
      fs: {
        readFile(
          tempFile: string,
          callback: (err: Error | null, text: string | null) => void,
        ): void;
        writeFile(
          contents: string | Uint8Array,
          callback: (tempFile: string | null) => void,
        ): void;
      };
      callback: (err: Error | null, res: unknown) => void;
    }) => void;
    formatMessages: (params: {
      callName: string;
      refs: unknown;
      messages: PartialMessage[];
      options: FormatMessagesOptions;
      callback: (err: Error | null, res: string[] | null) => void;
    }) => void;
    analyzeMetafile: (params: {
      callName: string;
      refs: unknown;
      metafile: string;
      options: AnalyzeMetafileOptions | undefined;
      callback: (err: Error | null, res: string | null) => void;
    }) => void;
  };
}

/**
 * Creates a communication channel for interacting with the esbuild service.
 * Handles packet encoding/decoding, request/response routing, and plugin
 * callback bridging.
 */
export function createChannel(
  streamIn: StreamIn,
  expectedVersion?: string,
): ChannelResult {
  const requestCallbacksByKey: Record<
    number,
    Record<
      string,
      (id: number, request: Record<string, unknown>) => void | Promise<void>
    >
  > = {};
  const closeData = { didClose: false, reason: "" };
  let responseCallbacks: Record<
    number,
    (error: string | null, response: Record<string, unknown> | null) => void
  > = {};
  let nextRequestID = 0;
  let nextBuildKey = 0;
  let stdout = new Uint8Array(16 * 1024);
  let stdoutUsed = 0;

  const readFromStdout = (chunk: Uint8Array): void => {
    const limit = stdoutUsed + chunk.length;
    if (limit > stdout.length) {
      const swap = new Uint8Array(limit * 2);
      swap.set(stdout);
      stdout = swap;
    }
    stdout.set(chunk, stdoutUsed);
    stdoutUsed += chunk.length;
    let offset = 0;

    while (offset + 4 <= stdoutUsed) {
      const length = readUInt32LE(stdout, offset);
      if (offset + 4 + length > stdoutUsed) {
        break;
      }
      offset += 4;
      handleIncomingPacket(stdout.subarray(offset, offset + length), isFirstPacket);
      offset += length;
    }

    if (offset > 0) {
      stdout.copyWithin(0, offset, stdoutUsed);
      stdoutUsed -= offset;
    }
  };

  let closeResolver: () => void;
  const closePromise = new Promise<void>((resolve) => {
    closeResolver = resolve;
  });

  const afterClose = (error?: Error): void => {
    closeData.didClose = true;
    if (error) closeData.reason = ": " + (error.message || error);
    const text = "The service was stopped" + closeData.reason;
    for (const id in responseCallbacks) {
      responseCallbacks[Number(id)](text, null);
    }
    responseCallbacks = {} as Record<
      number,
      (error: string | null, response: Record<string, unknown> | null) => void
    >;
    closeResolver();
  };

  const waitForClose = (): Promise<void> => closePromise;

  const sendRequest = (
    refs: unknown,
    value: Record<string, unknown>,
    callback: (error: string | null, response: Record<string, unknown> | null) => void,
  ): void => {
    if (closeData.didClose) {
      return callback("The service is no longer running" + closeData.reason, null);
    }
    const id = nextRequestID++;
    responseCallbacks[id] = (error, response) => {
      try {
        callback(error, response);
      } finally {
        if (refs) (refs as { unref: () => void }).unref();
      }
    };
    if (refs) (refs as { ref: () => void }).ref();
    streamIn.writeToStdin(encodePacket({ id, isRequest: true, value }));
  };

  const sendResponse = (id: number, value: object): void => {
    if (closeData.didClose) {
      throw new Error("The service is no longer running" + closeData.reason);
    }
    streamIn.writeToStdin(encodePacket({ id, isRequest: false, value }));
  };

  const handleRequest = (
    id: number,
    request: Record<string, unknown>,
  ): void => {
    try {
      if (request.command === "ping") {
        sendResponse(id, {});
        return;
      }
      if (typeof request.key === "number") {
        const requestCallbacks = requestCallbacksByKey[request.key as number];
        if (!requestCallbacks) {
          return;
        }
        const callback = requestCallbacks[request.command as string];
        if (callback) {
          const result = callback(id, request);
          if (result instanceof Promise) {
            result.catch(() => {});
          }
          return;
        }
      }
      throw new Error(`Invalid command: ` + request.command);
    } catch (e) {
      const errors = [extractErrorMessageV8(e, streamIn, void 0, "")];
      try {
        sendResponse(id, { errors });
      } catch {
        // Ignore error
      }
    }
  };

  let isFirstPacket = true;

  const handleIncomingPacket = (bytes: Uint8Array, firstPacket: boolean): void => {
    if (firstPacket) {
      isFirstPacket = false;
      const binaryVersion = String.fromCharCode(...bytes);
      const expected = expectedVersion ?? getVersion();
      if (binaryVersion !== expected) {
        throw new Error(
          `Cannot start service: Host version "${expected}" does not match binary version ${
            quote(binaryVersion)
          }`,
        );
      }
      return;
    }

    const packet = decodePacket(bytes);
    if (packet.isRequest) {
      handleRequest(packet.id, packet.value as Record<string, unknown>);
    } else {
      const callback = responseCallbacks[packet.id];
      delete responseCallbacks[packet.id];
      if ((packet.value as Record<string, unknown>).error) {
        callback((packet.value as Record<string, unknown>).error as string, {});
      } else {
        callback(null, packet.value as Record<string, unknown>);
      }
    }
  };

  const buildOrContext = (params: {
    callName: string;
    refs: unknown;
    options: Record<string, unknown> | undefined;
    isTTY: boolean;
    defaultWD: string;
    callback: (
      err: Error | null,
      res: unknown,
      onEndErrors?: Message[],
      onEndWarnings?: Message[],
    ) => void;
  }): void => {
    let refCount = 0;
    const buildKey = nextBuildKey++;
    const requestCallbacks: Record<
      string,
      (id: number, request: Record<string, unknown>) => void | Promise<void>
    > = {};
    const buildRefs = {
      ref() {
        if (++refCount === 1) {
          if (params.refs) (params.refs as { ref: () => void }).ref();
        }
      },
      unref() {
        if (--refCount === 0) {
          delete requestCallbacksByKey[buildKey];
          if (params.refs) (params.refs as { unref: () => void }).unref();
        }
      },
    };
    requestCallbacksByKey[buildKey] = requestCallbacks;
    buildRefs.ref();

    buildOrContextImpl(
      params.callName,
      buildKey,
      sendRequest,
      sendResponse,
      buildRefs,
      streamIn,
      requestCallbacks,
      params.options,
      params.isTTY,
      params.defaultWD,
      params.callback,
    );
  };

  const transform2 = (params: {
    callName: string;
    refs: unknown;
    input: string | Uint8Array;
    options: Record<string, unknown>;
    isTTY: boolean;
    fs: {
      readFile(
        tempFile: string,
        callback: (err: Error | null, text: string | null) => void,
      ): void;
      writeFile(
        contents: string | Uint8Array,
        callback: (tempFile: string | null) => void,
      ): void;
    };
    callback: (err: Error | null, res: unknown) => void;
  }): void => {
    const details = createObjectStash();

    let start = (inputPath: string | null): void => {
      try {
        if (
          typeof params.input !== "string"
          && !(params.input instanceof Uint8Array)
        ) {
          throw new Error('The input to "transform" must be a string or a Uint8Array');
        }

        const { flags, mangleCache } = flagsForTransformOptions(
          params.callName,
          params.options,
          params.isTTY,
          transformLogLevelDefault,
        );

        const request: Record<string, unknown> = {
          command: "transform",
          flags,
          inputFS: inputPath !== null,
          input: inputPath !== null
            ? encodeUTF8(inputPath)
            : typeof params.input === "string"
            ? encodeUTF8(params.input)
            : params.input,
        };

        if (mangleCache) request.mangleCache = mangleCache;

        sendRequest(params.refs, request, (error, response) => {
          if (error) return params.callback(new Error(error), null);

          const errors = replaceDetailsInMessages(
            response!.errors as Message[],
            details,
          );
          const warnings = replaceDetailsInMessages(
            response!.warnings as Message[],
            details,
          );
          let outstanding = 1;
          const next = (): void => {
            if (--outstanding === 0) {
              const result: Record<string, unknown> = {
                warnings,
                code: response!.code,
                map: response!.map,
                mangleCache: void 0,
                legalComments: void 0,
              };
              if ("legalComments" in response!) {
                (result as Record<string, unknown>).legalComments =
                  response!.legalComments;
              }
              if (response!.mangleCache) {
                (result as Record<string, unknown>).mangleCache = response!.mangleCache;
              }
              params.callback(null, result);
            }
          };

          if ((errors as Message[]).length > 0) {
            return params.callback(
              failureErrorWithLog("Transform failed", errors as Message[], warnings),
              null,
            );
          }

          if (response!.codeFS) {
            outstanding++;
            params.fs.readFile(response!.code as string, (err, contents) => {
              if (err !== null) {
                params.callback(err, null);
              } else {
                (response as Record<string, unknown>).code = encodeUTF8(
                  contents as string,
                );
                next();
              }
            });
          }

          if (response!.mapFS) {
            outstanding++;
            params.fs.readFile(response!.map as string, (err, contents) => {
              if (err !== null) {
                params.callback(err, null);
              } else {
                (response as Record<string, unknown>).map = encodeUTF8(
                  contents as string,
                );
                next();
              }
            });
          }

          next();
        });
      } catch (e) {
        const flags: string[] = [];
        try {
          pushLogFlags(
            flags,
            params.options ?? {},
            {},
            params.isTTY,
            transformLogLevelDefault,
          );
        } catch {
          // Ignore
        }
        const error = extractErrorMessageV8(e, streamIn, void 0, "");
        sendRequest(
          params.refs,
          { command: "error", flags, error },
          () => {
            (error as Message).detail = details.load(
              (error as Message).detail as number,
            );
            params.callback(
              failureErrorWithLog(
                "Transform failed",
                [error as Message],
                [],
              ),
              null,
            );
          },
        );
      }
    };

    if (
      (typeof params.input === "string" || params.input instanceof Uint8Array)
      && params.input.length > 1024 * 1024
    ) {
      const next = start;
      start = (inputPath) => params.fs.writeFile(params.input, () => next(inputPath));
    }

    start(null);
  };

  const formatMessages2 = (params: {
    callName: string;
    refs: unknown;
    messages: PartialMessage[];
    options: FormatMessagesOptions;
    callback: (err: Error | null, res: string[] | null) => void;
  }): void => {
    if (!params.options) {
      throw new Error(`Missing second argument in ${params.callName}() call`);
    }
    const keys: Record<string, boolean> = {};
    const kind = getFlag<string>(params.options, keys, "kind", mustBeString);
    const color = getFlag<boolean>(params.options, keys, "color", mustBeBoolean);
    const terminalWidth = getFlag<number>(
      params.options,
      keys,
      "terminalWidth",
      mustBeInteger,
    );

    checkForInvalidFlags(params.options, keys, `in ${params.callName}() call`);

    if (kind === void 0) {
      throw new Error(`Missing "kind" in ${params.callName}() call`);
    }
    if (kind !== "error" && kind !== "warning") {
      throw new Error(
        `Expected "kind" to be "error" or "warning" in ${params.callName}() call`,
      );
    }

    const request: Record<string, unknown> = {
      command: "format-msgs",
      messages: sanitizeMessages(
        params.messages,
        "messages",
        null,
        "",
        terminalWidth,
      ),
      isWarning: kind === "warning",
    };

    if (color !== void 0) (request as Record<string, unknown>).color = color;
    if (terminalWidth !== void 0) {
      (request as Record<string, unknown>).terminalWidth = terminalWidth;
    }

    sendRequest(params.refs, request, (error, response) => {
      if (error) return params.callback(new Error(error), null);
      params.callback(null, response!.messages as string[]);
    });
  };

  const analyzeMetafile2 = (params: {
    callName: string;
    refs: unknown;
    metafile: string;
    options: AnalyzeMetafileOptions | undefined;
    callback: (err: Error | null, res: string | null) => void;
  }): void => {
    if (params.options === void 0) params.options = {} as AnalyzeMetafileOptions;
    const keys: Record<string, boolean> = {};
    const color = getFlag<boolean>(params.options, keys, "color", mustBeBoolean);
    const verbose = getFlag<boolean>(params.options, keys, "verbose", mustBeBoolean);

    checkForInvalidFlags(params.options, keys, `in ${params.callName}() call`);

    const request: Record<string, unknown> = {
      command: "analyze-metafile",
      metafile: params.metafile,
    };

    if (color !== void 0) (request as Record<string, unknown>).color = color;
    if (verbose !== void 0) (request as Record<string, unknown>).verbose = verbose;

    sendRequest(params.refs, request, (error, response) => {
      if (error) return params.callback(new Error(error), null);
      params.callback(null, response!.result as string);
    });
  };

  return {
    readFromStdout,
    afterClose,
    waitForClose,
    service: {
      buildOrContext,
      transform: transform2,
      formatMessages: formatMessages2,
      analyzeMetafile: analyzeMetafile2,
    },
  };
}

function readUInt32LE(buffer: Uint8Array, offset: number): number {
  return (
    (buffer[offset++]
      | (buffer[offset++] << 8)
      | (buffer[offset++] << 16)
      | (buffer[offset++] << 24))
    >>> 0
  );
}

function pushLogFlags(
  flags: string[],
  options: Record<string, unknown>,
  keys: Record<string, boolean>,
  isTTY: boolean,
  logLevelDefault: string,
): void {
  const color = getFlag<boolean>(options, keys, "color", mustBeBoolean);
  const logLevel = getFlag<string>(options, keys, "logLevel", mustBeString);
  const logLimit = getFlag<number>(options, keys, "logLimit", mustBeInteger);
  if (color !== void 0) flags.push(`--color=${color}`);
  else if (isTTY) flags.push("--color=true");
  flags.push(`--log-level=${logLevel || logLevelDefault}`);
  flags.push(`--log-limit=${logLimit || 0}`);
}

interface BuildRefs {
  ref(): void;
  unref(): void;
}

function buildOrContextImpl(
  callName: string,
  buildKey: number,
  sendRequest: (
    refs: unknown,
    value: Record<string, unknown>,
    callback: (error: string | null, response: Record<string, unknown> | null) => void,
  ) => void,
  sendResponse: (id: number, value: Record<string, unknown>) => void,
  refs: BuildRefs,
  streamIn: StreamIn,
  requestCallbacks: Record<
    string,
    (id: number, request: Record<string, unknown>) => void | Promise<void>
  >,
  options: Record<string, unknown> | undefined,
  isTTY: boolean,
  defaultWD: string,
  callback: (
    err: Error | null,
    res: unknown,
    onEndErrors?: Message[],
    onEndWarnings?: Message[],
  ) => void,
): void {
  const details = createObjectStash();
  const isContext = callName === "context";

  const handleError = (
    e: unknown,
    pluginName: string,
  ): void => {
    const flags: string[] = [];
    try {
      pushLogFlags(flags, options ?? {}, {}, isTTY, buildLogLevelDefault);
    } catch {
      // Ignore
    }
    const message = extractErrorMessageV8(e, streamIn, details, pluginName);
    sendRequest(
      refs,
      { command: "error", flags, error: message },
      () => {
        (message as Message).detail = details.load(
          (message as Message).detail as number,
        );
        callback(
          failureErrorWithLog(
            isContext ? "Context failed" : "Build failed",
            [message as Message],
            [],
          ),
          null,
        );
      },
    );
  };

  let plugins: unknown[] | undefined;
  if (typeof options === "object") {
    const value = (options as Record<string, unknown>).plugins;
    if (value !== void 0) {
      if (!Array.isArray(value)) {
        return handleError(new Error(`"plugins" must be an array`), "");
      }
      plugins = value;
    }
  }

  if (plugins && plugins.length > 0) {
    if (streamIn.isSync) {
      return handleError(new Error("Cannot use plugins in synchronous API calls"), "");
    }

    handlePlugins(
      buildKey,
      sendRequest,
      sendResponse,
      refs,
      streamIn,
      requestCallbacks,
      options ?? {},
      plugins,
      details,
    ).then(
      (result) => {
        if (!result.ok) {
          return handleError(result.error, result.pluginName ?? "");
        }
        try {
          buildOrContextContinue(
            result.requestPlugins ?? null,
            result.runOnEndCallbacks ?? ((_result, done) => done([], [])),
            result.scheduleOnDisposeCallbacks ?? (() => {}),
          );
        } catch (e) {
          handleError(e, "");
        }
      },
      (e) => handleError(e, ""),
    );
    return;
  }

  try {
    buildOrContextContinue(null, (_result, done) => done([], []), () => {
      // Empty callback
    });
  } catch (e) {
    handleError(e, "");
  }

  function buildOrContextContinue(
    requestPlugins: unknown[] | null,
    runOnEndCallbacks: (
      result: Record<string, unknown>,
      done: (onEndErrors: Message[], onEndWarnings: Message[]) => void,
    ) => void,
    scheduleOnDisposeCallbacks: () => void,
  ): void {
    const writeDefault = streamIn.hasFS;
    const {
      entries,
      flags,
      write,
      stdinContents,
      stdinResolveDir,
      absWorkingDir,
      nodePaths,
      mangleCache,
    } = flagsForBuildOptions(
      callName,
      options,
      isTTY,
      buildLogLevelDefault,
      writeDefault,
    );

    if (write && !streamIn.hasFS) {
      throw new Error(`The "write" option is unavailable in this environment`);
    }

    const request: Record<string, unknown> = {
      command: "build",
      key: buildKey,
      entries,
      flags,
      write,
      stdinContents,
      stdinResolveDir,
      absWorkingDir: absWorkingDir || defaultWD,
      nodePaths,
      context: isContext,
    };

    if (requestPlugins) (request as Record<string, unknown>).plugins = requestPlugins;
    if (mangleCache) (request as Record<string, unknown>).mangleCache = mangleCache;

    const buildResponseToResult = (
      response: Record<string, unknown>,
      callback2: (
        err: Error | null,
        res: Record<string, unknown> | null,
        onEndErrors: Message[],
        onEndWarnings: Message[],
      ) => void,
    ): void => {
      const result: Record<string, unknown> = {
        errors: replaceDetailsInMessages(
          response.errors as Message[],
          details,
        ),
        warnings: replaceDetailsInMessages(
          response.warnings as Message[],
          details,
        ),
        outputFiles: void 0,
        metafile: void 0,
        mangleCache: void 0,
      };

      const originalErrors = (result.errors as Message[]).slice();
      const originalWarnings = (result.warnings as Message[]).slice();

      if (response.outputFiles) {
        (result as Record<string, unknown>).outputFiles = (response.outputFiles as {
          path: string;
          contents: Uint8Array;
          hash: string;
        }[]).map(convertOutputFiles);
      }

      if (response.metafile) {
        (result as Record<string, unknown>).metafile = parseJSON(
          response.metafile as Uint8Array,
        );
      }

      if (response.mangleCache) {
        (result as Record<string, unknown>).mangleCache = response.mangleCache;
      }

      if (response.writeToStdout !== void 0) {
        console.log(
          decodeUTF8(response.writeToStdout as Uint8Array).replace(/\n$/, ""),
        );
      }

      runOnEndCallbacks(
        result,
        (onEndErrors, onEndWarnings) => {
          if (originalErrors.length > 0 || onEndErrors.length > 0) {
            const error = failureErrorWithLog(
              "Build failed",
              originalErrors.concat(onEndErrors),
              originalWarnings.concat(onEndWarnings),
            );
            return callback2(error, null, onEndErrors, onEndWarnings);
          }
          callback2(null, result, onEndErrors, onEndWarnings);
        },
      );
    };

    let latestResultPromise: Promise<Record<string, unknown>> | undefined;
    let provideLatestResult:
      | ((
        err: Error | null,
        result: Record<string, unknown> | undefined,
      ) => void)
      | undefined;

    if (isContext) {
      requestCallbacks["on-end"] = (id, request2) => {
        buildResponseToResult(
          request2 as Record<string, unknown>,
          (err, res, onEndErrors, onEndWarnings) => {
            const response = {
              errors: onEndErrors,
              warnings: onEndWarnings,
            };
            if (provideLatestResult) {
              provideLatestResult(err, res as Record<string, unknown> | undefined);
            }
            latestResultPromise = void 0;
            provideLatestResult = undefined;
            sendResponse(id, response);
          },
        );
      };
    }

    sendRequest(
      refs,
      request,
      (error, response) => {
        if (error) {
          return callback(new Error(error), null);
        }
        if (!isContext) {
          return buildResponseToResult(
            response!,
            (err, res) => {
              scheduleOnDisposeCallbacks();
              return callback(err, res as Record<string, unknown> | null);
            },
          );
        }

        if ((response!.errors as Message[]).length > 0) {
          return callback(
            failureErrorWithLog(
              "Context failed",
              response!.errors as Message[],
              response!.warnings as Message[],
            ),
            null,
          );
        }

        let didDispose = false;
        const result: BuildContext = {
          rebuild: () => {
            if (!latestResultPromise) {
              latestResultPromise = new Promise<Record<string, unknown>>(
                (resolve, reject) => {
                  let settlePromise: (() => void) | undefined;
                  provideLatestResult = (err, result2) => {
                    if (!settlePromise) {
                      settlePromise = () => err ? reject(err) : resolve(result2!);
                    }
                  };

                  const triggerAnotherBuild = (): void => {
                    const request2 = {
                      command: "rebuild",
                      key: buildKey,
                    };
                    sendRequest(refs, request2, (error2, _response2) => {
                      if (error2) {
                        reject(new Error(error2));
                      } else if (settlePromise) {
                        settlePromise();
                      } else {
                        triggerAnotherBuild();
                      }
                    });
                  };

                  triggerAnotherBuild();
                },
              );
            }
            return latestResultPromise.then(asBuildResult);
          },
          watch: (options2 = {} as WatchOptions) =>
            new Promise<void>((resolve, reject) => {
              if (!streamIn.hasFS) {
                throw new Error(`Cannot use the "watch" API in this environment`);
              }
              const keys: Record<string, boolean> = {};
              const delay = getFlag<number>(options2, keys, "delay", mustBeInteger);
              checkForInvalidFlags(options2, keys, `in watch() call`);
              const request2 = {
                command: "watch",
                key: buildKey,
              };
              if (delay) (request2 as Record<string, unknown>).delay = delay;
              sendRequest(refs, request2, (error2) => {
                if (error2) reject(new Error(error2));
                else resolve();
              });
            }),
          serve: (options2 = {} as ServeOptions) =>
            new Promise<ServeResult>((resolve, reject) => {
              if (!streamIn.hasFS) {
                throw new Error(`Cannot use the "serve" API in this environment`);
              }
              const keys: Record<string, boolean> = {};
              const port = getFlag<number>(
                options2,
                keys,
                "port",
                mustBeValidPortNumber,
              );
              const host = getFlag<string>(options2, keys, "host", mustBeString);
              const servedir = getFlag<string>(
                options2,
                keys,
                "servedir",
                mustBeString,
              );
              const keyfile = getFlag<string>(
                options2,
                keys,
                "keyfile",
                mustBeString,
              );
              const certfile = getFlag<string>(
                options2,
                keys,
                "certfile",
                mustBeString,
              );
              const fallback = getFlag<string>(
                options2,
                keys,
                "fallback",
                mustBeString,
              );
              const cors = getFlag<Record<string, unknown>>(
                options2,
                keys,
                "cors",
                mustBeObject,
              );
              const onRequest = getFlag<(args: ServeOnRequestArgs) => void>(
                options2,
                keys,
                "onRequest",
                mustBeFunction,
              );
              checkForInvalidFlags(options2, keys, `in serve() call`);
              const request2: Record<string, unknown> = {
                command: "serve",
                key: buildKey,
                onRequest: !!onRequest,
              };
              if (port !== void 0) request2.port = port;
              if (host !== void 0) request2.host = host;
              if (servedir !== void 0) request2.servedir = servedir;
              if (keyfile !== void 0) request2.keyfile = keyfile;
              if (certfile !== void 0) request2.certfile = certfile;
              if (fallback !== void 0) request2.fallback = fallback;
              if (cors) {
                const corsKeys: Record<string, boolean> = {};
                const origin = getFlag<string | string[]>(
                  cors,
                  corsKeys,
                  "origin",
                  mustBeStringOrArrayOfStrings,
                );
                checkForInvalidFlags(cors, corsKeys, `on "cors" object`);
                if (Array.isArray(origin)) {
                  request2.corsOrigin = origin;
                } else if (origin !== void 0) {
                  request2.corsOrigin = [origin];
                }
              }
              sendRequest(refs, request2, (error2, response2) => {
                if (error2) return reject(new Error(error2));
                if (onRequest) {
                  requestCallbacks["serve-request"] = (id, request3) => {
                    onRequest(request3.args as ServeOnRequestArgs);
                    sendResponse(id, {});
                  };
                }
                resolve(response2 as unknown as ServeResult);
              });
            }),
          cancel: () =>
            new Promise<void>((resolve) => {
              if (didDispose) return resolve();
              const request2 = {
                command: "cancel",
                key: buildKey,
              };
              sendRequest(refs, request2, () => {
                resolve();
              });
            }),
          dispose: () =>
            new Promise<void>((resolve) => {
              if (didDispose) return resolve();
              didDispose = true;
              const request2 = {
                command: "dispose",
                key: buildKey,
              };
              sendRequest(refs, request2, () => {
                resolve();
                scheduleOnDisposeCallbacks();
                refs.unref();
              });
            }),
        };

        refs.ref();
        callback(null, result);
      },
    );
  }
}

function mustBeValidPortNumber(value: unknown): string | null {
  if (
    typeof value === "number" && value === (value | 0) && value >= 0 && value <= 65535
  ) {
    return null;
  }
  return "a valid port number";
}

function parseJSON(bytes: Uint8Array): unknown {
  let text: string | undefined;
  try {
    text = decodeUTF8(bytes);
  } catch {
    return JSON_parse(bytes);
  }
  return JSON.parse(text!);
}

interface HandlePluginsResult {
  ok: boolean;
  error?: unknown;
  pluginName?: string;
  requestPlugins?: unknown[];
  runOnEndCallbacks?: (
    result: Record<string, unknown>,
    done: (onEndErrors: Message[], onEndWarnings: Message[]) => void,
  ) => void;
  scheduleOnDisposeCallbacks?: () => void;
}

async function handlePlugins(
  buildKey: number,
  sendRequest: (
    refs: unknown,
    value: Record<string, unknown>,
    callback: (error: string | null, response: Record<string, unknown> | null) => void,
  ) => void,
  sendResponse: (id: number, value: Record<string, unknown>) => void,
  refs: BuildRefs,
  streamIn: StreamIn,
  requestCallbacks: Record<
    string,
    (id: number, request: Record<string, unknown>) => void | Promise<void>
  >,
  initialOptions: Record<string, unknown>,
  plugins: unknown[],
  details: ReturnType<typeof createObjectStash>,
): Promise<HandlePluginsResult> {
  const onStartCallbacks: {
    name: string;
    callback: () => OnStartResult | null | void | Promise<OnStartResult | null | void>;
    note: () => { text: string; location: BuildLocation } | undefined;
  }[] = [];
  const onEndCallbacks: {
    name: string;
    callback: (
      result: BuildResult,
    ) => OnEndResult | null | void | Promise<OnEndResult | null | void>;
    note: () => { text: string; location: BuildLocation } | undefined;
  }[] = [];
  const onResolveCallbacks: Record<
    number,
    {
      name: string;
      callback: (
        args: OnResolveArgs,
      ) =>
        | OnResolveResult
        | null
        | undefined
        | Promise<OnResolveResult | null | undefined>;
      note: () => { text: string; location: BuildLocation } | undefined;
    }
  > = {};
  const onLoadCallbacks: Record<
    number,
    {
      name: string;
      callback: (
        args: OnLoadArgs,
      ) => OnLoadResult | null | undefined | Promise<OnLoadResult | null | undefined>;
      note: () => { text: string; location: BuildLocation } | undefined;
    }
  > = {};
  const onDisposeCallbacks: (() => void)[] = [];
  let nextCallbackID = 0;
  let i = 0;
  const requestPlugins: unknown[] = [];
  let isSetupDone = false;

  plugins = [...plugins];

  for (const item of plugins) {
    const keys: Record<string, boolean> = {};
    if (typeof item !== "object") {
      throw new Error(`Plugin at index ${i} must be an object`);
    }
    const name = getFlag<string>(
      item as Record<string, unknown>,
      keys,
      "name",
      mustBeString,
    );
    if (typeof name !== "string" || name === "") {
      throw new Error(`Plugin at index ${i} is missing a name`);
    }

    try {
      const setup = getFlag<
        (build: PluginBuild) => void | Promise<void>
      >(item as Record<string, unknown>, keys, "setup", mustBeFunction);
      if (typeof setup !== "function") {
        throw new Error(`Plugin is missing a setup function`);
      }
      checkForInvalidFlags(
        item as Record<string, unknown>,
        keys,
        `on plugin ${quote(name)}`,
      );

      const plugin: {
        name: string;
        onStart: boolean;
        onEnd: boolean;
        onResolve: { id: number; filter: string; namespace: string }[];
        onLoad: { id: number; filter: string; namespace: string }[];
      } = {
        name,
        onStart: false,
        onEnd: false,
        onResolve: [],
        onLoad: [],
      };

      i++;

      const resolve = (
        path: string,
        options: ResolveOptions = {} as ResolveOptions,
      ): Promise<ResolveResult> => {
        if (!isSetupDone) {
          throw new Error('Cannot call "resolve" before plugin setup has completed');
        }
        if (typeof path !== "string") {
          throw new Error(`The path to resolve must be a string`);
        }
        const keys2: Record<string, boolean> = Object.create(null);
        const pluginName = getFlag<string>(options, keys2, "pluginName", mustBeString);
        const importer = getFlag<string>(options, keys2, "importer", mustBeString);
        const namespace = getFlag<string>(options, keys2, "namespace", mustBeString);
        const resolveDir = getFlag<string>(options, keys2, "resolveDir", mustBeString);
        const kind = getFlag<string>(options, keys2, "kind", mustBeString);
        const pluginData = getFlag<unknown>(
          options,
          keys2,
          "pluginData",
          canBeAnything,
        );
        const importAttributes = getFlag<Record<string, string>>(
          options,
          keys2,
          "with",
          mustBeObject,
        );
        checkForInvalidFlags(options, keys2, "in resolve() call");

        return new Promise<ResolveResult>((resolve2, reject) => {
          const request: Record<string, unknown> = {
            command: "resolve",
            path,
            key: buildKey,
            pluginName: name,
          };
          if (pluginName != null) request.pluginName = pluginName;
          if (importer != null) request.importer = importer;
          if (namespace != null) request.namespace = namespace;
          if (resolveDir != null) request.resolveDir = resolveDir;
          if (kind != null) request.kind = kind;
          else throw new Error(`Must specify "kind" when calling "resolve"`);
          if (pluginData != null) request.pluginData = details.store(pluginData);
          if (importAttributes != null) {
            request.with = sanitizeStringMap(importAttributes, "with");
          }

          sendRequest(refs, request, (error, response) => {
            if (error !== null) reject(new Error(error));
            else {
              resolve2({
                errors: replaceDetailsInMessages(
                  response!.errors as Message[],
                  details,
                ),
                warnings: replaceDetailsInMessages(
                  response!.warnings as Message[],
                  details,
                ),
                path: response!.path as string,
                external: response!.external as boolean,
                sideEffects: response!.sideEffects as boolean,
                namespace: response!.namespace as string,
                suffix: response!.suffix as string,
                pluginData: details.load(response!.pluginData as number),
              });
            }
          });
        });
      };

      const promise = setup({
        initialOptions: initialOptions as BuildOptions,
        resolve,
        onStart(callback) {
          const registeredText =
            `This error came from the "onStart" callback registered here:`;
          const registeredNote = extractCallerV8(
            new Error(registeredText),
            streamIn,
            "onStart",
          );
          onStartCallbacks.push({ name, callback, note: registeredNote });
          plugin.onStart = true;
        },
        onEnd(callback) {
          const registeredText =
            `This error came from the "onEnd" callback registered here:`;
          const registeredNote = extractCallerV8(
            new Error(registeredText),
            streamIn,
            "onEnd",
          );
          onEndCallbacks.push({ name, callback, note: registeredNote });
          plugin.onEnd = true;
        },
        onResolve(options, callback) {
          const registeredText =
            `This error came from the "onResolve" callback registered here:`;
          const registeredNote = extractCallerV8(
            new Error(registeredText),
            streamIn,
            "onResolve",
          );
          const keys2: Record<string, boolean> = {};
          const filter = getFlag<RegExp>(options, keys2, "filter", mustBeRegExp);
          const namespace = getFlag<string>(options, keys2, "namespace", mustBeString);
          checkForInvalidFlags(
            options,
            keys2,
            `in onResolve() call for plugin ${quote(name)}`,
          );
          if (filter == null) {
            throw new Error(`onResolve() call is missing a filter`);
          }
          const id = nextCallbackID++;
          onResolveCallbacks[id] = {
            name,
            callback: callback as (
              args: OnResolveArgs,
            ) =>
              | OnResolveResult
              | null
              | undefined
              | Promise<OnResolveResult | null | undefined>,
            note: registeredNote,
          };
          plugin.onResolve.push({
            id,
            filter: jsRegExpToGoRegExp(filter),
            namespace: namespace || "",
          });
        },
        onLoad(options, callback) {
          const registeredText =
            `This error came from the "onLoad" callback registered here:`;
          const registeredNote = extractCallerV8(
            new Error(registeredText),
            streamIn,
            "onLoad",
          );
          const keys2: Record<string, boolean> = {};
          const filter = getFlag<RegExp>(options, keys2, "filter", mustBeRegExp);
          const namespace = getFlag<string>(options, keys2, "namespace", mustBeString);
          checkForInvalidFlags(
            options,
            keys2,
            `in onLoad() call for plugin ${quote(name)}`,
          );
          if (filter == null) {
            throw new Error(`onLoad() call is missing a filter`);
          }
          const id = nextCallbackID++;
          onLoadCallbacks[id] = {
            name,
            callback: callback as (
              args: OnLoadArgs,
            ) =>
              | OnLoadResult
              | null
              | undefined
              | Promise<OnLoadResult | null | undefined>,
            note: registeredNote,
          };
          plugin.onLoad.push({
            id,
            filter: jsRegExpToGoRegExp(filter),
            namespace: namespace || "",
          });
        },
        onDispose(callback) {
          onDisposeCallbacks.push(callback);
        },
        esbuild: streamIn.esbuild,
      });

      if (promise) await promise;
      requestPlugins.push(plugin);
    } catch (e) {
      return { ok: false, error: e, pluginName: name };
    }
  }

  requestCallbacks["on-start"] = async (id, _request) => {
    details.clear();
    const response: { errors: Message[]; warnings: Message[] } = {
      errors: [],
      warnings: [],
    };
    await Promise.all(
      onStartCallbacks.map(async ({ name, callback, note: _note }) => {
        try {
          const result = await callback();
          if (result != null) {
            if (typeof result !== "object") {
              throw new Error(
                `Expected onStart() callback in plugin ${
                  quote(name)
                } to return an object`,
              );
            }
            const keys: Record<string, boolean> = {};
            const errors = getFlag<Message[]>(
              result as Record<string, unknown>,
              keys,
              "errors",
              mustBeArray,
            );
            const warnings = getFlag<Message[]>(
              result as Record<string, unknown>,
              keys,
              "warnings",
              mustBeArray,
            );
            checkForInvalidFlags(
              result as Record<string, unknown>,
              keys,
              `from onStart() callback in plugin ${quote(name)}`,
            );
            if (errors != null) {
              response.errors.push(
                ...sanitizeMessages(errors, "errors", details, name, void 0),
              );
            }
            if (warnings != null) {
              response.warnings.push(
                ...sanitizeMessages(warnings, "warnings", details, name, void 0),
              );
            }
          }
        } catch (e) {
          response.errors.push(
            extractErrorMessageV8(e, streamIn, details, name),
          );
        }
      }),
    );
    sendResponse(id, response);
  };

  requestCallbacks["on-resolve"] = async (id, request) => {
    let response: Record<string, unknown> = {};
    let name = "";
    let callback:
      | ((
        args: OnResolveArgs,
      ) =>
        | OnResolveResult
        | null
        | undefined
        | Promise<OnResolveResult | null | undefined>)
      | undefined;
    let _note:
      | (() => { text: string; location: BuildLocation } | undefined)
      | undefined;

    for (const id2 of request.ids as number[]) {
      try {
        ({ name, callback, note: _note } = onResolveCallbacks[id2]);
        const result = await callback!({
          path: request.path as string,
          importer: request.importer as string,
          namespace: request.namespace as string,
          resolveDir: request.resolveDir as string,
          kind: request.kind as ImportKind,
          pluginData: details.load(request.pluginData as number),
          with: request.with as Record<string, string>,
        });

        if (result != null) {
          if (typeof result !== "object") {
            throw new Error(
              `Expected onResolve() callback in plugin ${
                quote(name)
              } to return an object`,
            );
          }
          const resultRecord = result;
          const keys: Record<string, boolean> = {};
          const pluginName = getFlag<string>(
            resultRecord,
            keys,
            "pluginName",
            mustBeString,
          );
          const path = getFlag<string>(resultRecord, keys, "path", mustBeString);
          const namespace = getFlag<string>(
            resultRecord,
            keys,
            "namespace",
            mustBeString,
          );
          const suffix = getFlag<string>(resultRecord, keys, "suffix", mustBeString);
          const external = getFlag<boolean>(
            resultRecord,
            keys,
            "external",
            mustBeBoolean,
          );
          const sideEffects = getFlag<boolean>(
            resultRecord,
            keys,
            "sideEffects",
            mustBeBoolean,
          );
          const pluginData = getFlag<unknown>(
            resultRecord,
            keys,
            "pluginData",
            canBeAnything,
          );
          const errors = getFlag<Message[]>(resultRecord, keys, "errors", mustBeArray);
          const warnings = getFlag<Message[]>(
            resultRecord,
            keys,
            "warnings",
            mustBeArray,
          );
          const watchFiles = getFlag<string[]>(
            resultRecord,
            keys,
            "watchFiles",
            mustBeArrayOfStrings,
          );
          const watchDirs = getFlag<string[]>(
            resultRecord,
            keys,
            "watchDirs",
            mustBeArrayOfStrings,
          );
          checkForInvalidFlags(
            resultRecord,
            keys,
            `from onResolve() callback in plugin ${quote(name)}`,
          );
          response.id = id2;
          if (pluginName != null) response.pluginName = pluginName;
          if (path != null) response.path = path;
          if (namespace != null) response.namespace = namespace;
          if (suffix != null) response.suffix = suffix;
          if (external != null) response.external = external;
          if (sideEffects != null) response.sideEffects = sideEffects;
          if (pluginData != null) {
            response.pluginData = details.store(pluginData);
          }
          if (errors != null) {
            response.errors = sanitizeMessages(errors, "errors", details, name, void 0);
          }
          if (warnings != null) {
            response.warnings = sanitizeMessages(
              warnings,
              "warnings",
              details,
              name,
              void 0,
            );
          }
          if (watchFiles != null) {
            response.watchFiles = sanitizeStringArray(watchFiles, "watchFiles");
          }
          if (watchDirs != null) {
            response.watchDirs = sanitizeStringArray(watchDirs, "watchDirs");
          }
          break;
        }
      } catch (e) {
        response = {
          id: id2,
          errors: [
            extractErrorMessageV8(e, streamIn, details, name),
          ],
        };
        break;
      }
    }
    sendResponse(id, response);
  };

  requestCallbacks["on-load"] = async (id, request) => {
    let response: Record<string, unknown> = {};
    let name = "";
    let callback:
      | ((
        args: OnLoadArgs,
      ) => OnLoadResult | null | undefined | Promise<OnLoadResult | null | undefined>)
      | undefined;
    let _note:
      | (() => { text: string; location: BuildLocation } | undefined)
      | undefined;

    for (const id2 of request.ids as number[]) {
      try {
        ({ name, callback, note: _note } = onLoadCallbacks[id2]);
        const result = await callback!({
          path: request.path as string,
          namespace: request.namespace as string,
          suffix: request.suffix as string,
          pluginData: details.load(request.pluginData as number),
          with: request.with as Record<string, string>,
        });

        if (result != null) {
          if (typeof result !== "object") {
            throw new Error(
              `Expected onLoad() callback in plugin ${quote(name)} to return an object`,
            );
          }
          const resultRecord = result;
          const keys: Record<string, boolean> = {};
          const pluginName = getFlag<string>(
            resultRecord,
            keys,
            "pluginName",
            mustBeString,
          );
          const contents = getFlag<string | Uint8Array>(
            resultRecord,
            keys,
            "contents",
            mustBeStringOrUint8Array,
          );
          const resolveDir = getFlag<string>(
            resultRecord,
            keys,
            "resolveDir",
            mustBeString,
          );
          const pluginData = getFlag<unknown>(
            resultRecord,
            keys,
            "pluginData",
            canBeAnything,
          );
          const loader = getFlag<string>(resultRecord, keys, "loader", mustBeString);
          const errors = getFlag<Message[]>(resultRecord, keys, "errors", mustBeArray);
          const warnings = getFlag<Message[]>(
            resultRecord,
            keys,
            "warnings",
            mustBeArray,
          );
          const watchFiles = getFlag<string[]>(
            resultRecord,
            keys,
            "watchFiles",
            mustBeArrayOfStrings,
          );
          const watchDirs = getFlag<string[]>(
            resultRecord,
            keys,
            "watchDirs",
            mustBeArrayOfStrings,
          );
          checkForInvalidFlags(
            resultRecord,
            keys,
            `from onLoad() callback in plugin ${quote(name)}`,
          );
          response.id = id2;
          if (pluginName != null) response.pluginName = pluginName;
          if (contents instanceof Uint8Array) {
            response.contents = contents;
          } else if (contents != null) {
            response.contents = encodeUTF8(contents);
          }
          if (resolveDir != null) response.resolveDir = resolveDir;
          if (pluginData != null) {
            response.pluginData = details.store(pluginData);
          }
          if (loader != null) response.loader = loader;
          if (errors != null) {
            response.errors = sanitizeMessages(errors, "errors", details, name, void 0);
          }
          if (warnings != null) {
            response.warnings = sanitizeMessages(
              warnings,
              "warnings",
              details,
              name,
              void 0,
            );
          }
          if (watchFiles != null) {
            response.watchFiles = sanitizeStringArray(watchFiles, "watchFiles");
          }
          if (watchDirs != null) {
            response.watchDirs = sanitizeStringArray(watchDirs, "watchDirs");
          }
          break;
        }
      } catch (e) {
        response = {
          id: id2,
          errors: [
            extractErrorMessageV8(e, streamIn, details, name),
          ],
        };
        break;
      }
    }
    sendResponse(id, response);
  };

  let runOnEndCallbacks = (
    _result: Record<string, unknown>,
    done: (onEndErrors: Message[], onEndWarnings: Message[]) => void,
  ): void => done([], []);

  if (onEndCallbacks.length > 0) {
    runOnEndCallbacks = (result, done) => {
      (async () => {
        const onEndErrors: Message[] = [];
        const onEndWarnings: Message[] = [];

        for (const { name, callback, note: _note } of onEndCallbacks) {
          let newErrors: Message[] | undefined;
          let newWarnings: Message[] | undefined;

          try {
            const value = await callback(result as BuildResult);
            if (value != null) {
              if (typeof value !== "object") {
                throw new Error(
                  `Expected onEnd() callback in plugin ${
                    quote(name)
                  } to return an object`,
                );
              }
              const keys: Record<string, boolean> = {};
              const errors = getFlag<Message[]>(
                value as Record<string, unknown>,
                keys,
                "errors",
                mustBeArray,
              );
              const warnings = getFlag<Message[]>(
                value as Record<string, unknown>,
                keys,
                "warnings",
                mustBeArray,
              );
              checkForInvalidFlags(
                value as Record<string, unknown>,
                keys,
                `from onEnd() callback in plugin ${quote(name)}`,
              );
              if (errors != null) {
                newErrors = sanitizeMessages(errors, "errors", details, name, void 0);
              }
              if (warnings != null) {
                newWarnings = sanitizeMessages(
                  warnings,
                  "warnings",
                  details,
                  name,
                  void 0,
                );
              }
            }
          } catch (e) {
            newErrors = [
              extractErrorMessageV8(e, streamIn, details, name),
            ];
          }

          if (newErrors) {
            onEndErrors.push(...newErrors);
            try {
              (result.errors as Message[]).push(...newErrors);
            } catch {
              // Ignore
            }
          }
          if (newWarnings) {
            onEndWarnings.push(...newWarnings);
            try {
              (result.warnings as Message[]).push(...newWarnings);
            } catch {
              // Ignore
            }
          }
        }

        done(onEndErrors, onEndWarnings);
      })();
    };
  }

  const scheduleOnDisposeCallbacks = (): void => {
    for (const cb of onDisposeCallbacks) {
      setTimeout(() => cb(), 0);
    }
  };

  isSetupDone = true;

  return {
    ok: true,
    requestPlugins,
    runOnEndCallbacks,
    scheduleOnDisposeCallbacks,
  };
}
