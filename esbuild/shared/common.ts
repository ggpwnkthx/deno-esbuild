/**
 * Shared validation, channel/IPC setup, and flag processing logic used by both
 * the native binary API ({@link ../mod.ts}) and the WASM API ({@link ../wasm.ts}).
 */
import type * as types from "./types.ts";
import * as protocol from "./stdio_protocol.ts";
import { JSON_parse } from "./uint8array_json_parser.ts";

export const ESBUILD_VERSION: string = "0.28.0";

const quote: (x: string) => string = JSON.stringify;

const buildLogLevelDefault = "warning";
const transformLogLevelDefault = "silent";

function validateAndJoinStringArray(values: string[], what: string): string {
  const toJoin: string[] = [];
  for (const value of values) {
    validateStringValue(value, what);
    if (value.indexOf(",") >= 0) throw new Error(`Invalid ${what}: ${value}`);
    toJoin.push(value);
  }
  return toJoin.join(",");
}

const canBeAnything = () => null;

const mustBeBoolean = (value: boolean | undefined): string | null =>
  typeof value === "boolean" ? null : "a boolean";

const mustBeString = (value: string | undefined): string | null =>
  typeof value === "string" ? null : "a string";

const mustBeRegExp = (value: RegExp | undefined): string | null =>
  value instanceof RegExp ? null : "a RegExp object";

const mustBeInteger = (value: number | undefined): string | null =>
  typeof value === "number" && value === (value | 0) ? null : "an integer";

const mustBeValidPortNumber = (value: number | undefined): string | null =>
  typeof value === "number" && value === (value | 0) && value >= 0 &&
    value <= 0xFFFF
    ? null
    : "a valid port number";

const mustBeFunction = (
  value: (arg0: unknown) => unknown | undefined,
): string | null => typeof value === "function" ? null : "a function";

const mustBeArray = <T>(value: T[] | undefined): string | null =>
  Array.isArray(value) ? null : "an array";

const mustBeArrayOfStrings = (value: string[] | undefined): string | null =>
  Array.isArray(value) && value.every((x) => typeof x === "string")
    ? null
    : "an array of strings";

const mustBeObject = (value: object | undefined): string | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? null
    : "an object";

const mustBeEntryPoints = (
  value: types.BuildOptions["entryPoints"],
): string | null =>
  typeof value === "object" && value !== null ? null : "an array or an object";

const mustBeWebAssemblyModule = (
  value: WebAssembly.Module | undefined,
): string | null =>
  value instanceof WebAssembly.Module ? null : "a WebAssembly.Module";

const mustBeObjectOrNull = (value: object | null | undefined): string | null =>
  typeof value === "object" && !Array.isArray(value)
    ? null
    : "an object or null";

const mustBeStringOrBoolean = (
  value: string | boolean | undefined,
): string | null =>
  typeof value === "string" || typeof value === "boolean"
    ? null
    : "a string or a boolean";

const mustBeStringOrObject = (
  value: string | object | undefined,
): string | null =>
  typeof value === "string" ||
    typeof value === "object" && value !== null && !Array.isArray(value)
    ? null
    : "a string or an object";

const mustBeStringOrArrayOfStrings = (
  value: string | string[] | undefined,
): string | null =>
  typeof value === "string" ||
    (Array.isArray(value) && value.every((x) => typeof x === "string"))
    ? null
    : "a string or an array of strings";

const mustBeStringOrUint8Array = (
  value: string | Uint8Array | undefined,
): string | null =>
  typeof value === "string" || value instanceof Uint8Array
    ? null
    : "a string or a Uint8Array";

const mustBeStringOrURL = (value: string | URL | undefined): string | null =>
  typeof value === "string" || value instanceof URL
    ? null
    : "a string or a URL";

type OptionKeys = { [key: string]: boolean };

function getFlag<T, K extends (keyof T & string)>(
  object: T,
  keys: OptionKeys,
  key: K,
  mustBeFn: (value: T[K]) => string | null,
): T[K] | undefined {
  const value = object[key];
  keys[key + ""] = true;
  if (value === undefined) return undefined;
  const mustBe = mustBeFn(value);
  if (mustBe !== null) throw new Error(`${quote(key)} must be ${mustBe}`);
  return value;
}

function checkForInvalidFlags(
  object: object,
  keys: OptionKeys,
  where: string,
): void {
  for (const key in object) {
    if (!(key in keys)) {
      throw new Error(`Invalid option ${where}: ${quote(key)}`);
    }
  }
}

export function validateInitializeOptions(
  options: types.InitializeOptions,
): types.InitializeOptions {
  const keys: OptionKeys = Object.create(null);
  const wasmURL = getFlag(options, keys, "wasmURL", mustBeStringOrURL);
  const wasmModule = getFlag(
    options,
    keys,
    "wasmModule",
    mustBeWebAssemblyModule,
  );
  const worker = getFlag(options, keys, "worker", mustBeBoolean);
  checkForInvalidFlags(options, keys, "in initialize() call");
  return {
    wasmURL,
    wasmModule,
    worker,
  };
}

type MangleCache = Record<string, string | false>;

function validateMangleCache(
  mangleCache: MangleCache | undefined,
): MangleCache | undefined {
  let validated: MangleCache | undefined;
  if (mangleCache !== undefined) {
    validated = Object.create(null) as MangleCache;
    for (const key in mangleCache) {
      const value = mangleCache[key];
      if (typeof value === "string" || value === false) {
        validated[key] = value;
      } else {
        throw new Error(
          `Expected ${
            quote(key)
          } in mangle cache to map to either a string or false`,
        );
      }
    }
  }
  return validated;
}

type CommonOptions = types.BuildOptions | types.TransformOptions;

function pushLogFlags(
  flags: string[],
  options: CommonOptions,
  keys: OptionKeys,
  isTTY: boolean,
  logLevelDefault: types.LogLevel,
): void {
  const color = getFlag(options, keys, "color", mustBeBoolean);
  const logLevel = getFlag(options, keys, "logLevel", mustBeString);
  const logLimit = getFlag(options, keys, "logLimit", mustBeInteger);

  if (color !== void 0) flags.push(`--color=${color}`);
  else if (isTTY) flags.push(`--color=true`); // This is needed to fix "execFileSync" which buffers stderr
  flags.push(`--log-level=${logLevel || logLevelDefault}`);
  flags.push(`--log-limit=${logLimit || 0}`);
}

function validateStringValue(
  value: unknown,
  what: string,
  key?: string,
): string {
  if (typeof value !== "string") {
    throw new Error(
      `Expected value for ${what}${
        key !== void 0 ? " " + quote(key) : ""
      } to be a string, got ${typeof value} instead`,
    );
  }
  return value;
}

function pushCommonFlags(
  flags: string[],
  options: CommonOptions,
  keys: OptionKeys,
): void {
  const legalComments = getFlag(options, keys, "legalComments", mustBeString);
  const sourceRoot = getFlag(options, keys, "sourceRoot", mustBeString);
  const sourcesContent = getFlag(
    options,
    keys,
    "sourcesContent",
    mustBeBoolean,
  );
  const target = getFlag(options, keys, "target", mustBeStringOrArrayOfStrings);
  const format = getFlag(options, keys, "format", mustBeString);
  const globalName = getFlag(options, keys, "globalName", mustBeString);
  const mangleProps = getFlag(options, keys, "mangleProps", mustBeRegExp);
  const reserveProps = getFlag(options, keys, "reserveProps", mustBeRegExp);
  const mangleQuoted = getFlag(options, keys, "mangleQuoted", mustBeBoolean);
  const minify = getFlag(options, keys, "minify", mustBeBoolean);
  const minifySyntax = getFlag(options, keys, "minifySyntax", mustBeBoolean);
  const minifyWhitespace = getFlag(
    options,
    keys,
    "minifyWhitespace",
    mustBeBoolean,
  );
  const minifyIdentifiers = getFlag(
    options,
    keys,
    "minifyIdentifiers",
    mustBeBoolean,
  );
  const lineLimit = getFlag(options, keys, "lineLimit", mustBeInteger);
  const drop = getFlag(options, keys, "drop", mustBeArrayOfStrings);
  const dropLabels = getFlag(options, keys, "dropLabels", mustBeArrayOfStrings);
  const charset = getFlag(options, keys, "charset", mustBeString);
  const treeShaking = getFlag(options, keys, "treeShaking", mustBeBoolean);
  const ignoreAnnotations = getFlag(
    options,
    keys,
    "ignoreAnnotations",
    mustBeBoolean,
  );
  const jsx = getFlag(options, keys, "jsx", mustBeString);
  const jsxFactory = getFlag(options, keys, "jsxFactory", mustBeString);
  const jsxFragment = getFlag(options, keys, "jsxFragment", mustBeString);
  const jsxImportSource = getFlag(
    options,
    keys,
    "jsxImportSource",
    mustBeString,
  );
  const jsxDev = getFlag(options, keys, "jsxDev", mustBeBoolean);
  const jsxSideEffects = getFlag(
    options,
    keys,
    "jsxSideEffects",
    mustBeBoolean,
  );
  const define = getFlag(options, keys, "define", mustBeObject);
  const logOverride = getFlag(options, keys, "logOverride", mustBeObject);
  const supported = getFlag(options, keys, "supported", mustBeObject);
  const pure = getFlag(options, keys, "pure", mustBeArrayOfStrings);
  const keepNames = getFlag(options, keys, "keepNames", mustBeBoolean);
  const platform = getFlag(options, keys, "platform", mustBeString);
  const tsconfigRaw = getFlag(
    options,
    keys,
    "tsconfigRaw",
    mustBeStringOrObject,
  );
  const absPaths = getFlag(options, keys, "absPaths", mustBeArrayOfStrings);

  if (legalComments) flags.push(`--legal-comments=${legalComments}`);
  if (sourceRoot !== void 0) flags.push(`--source-root=${sourceRoot}`);
  if (sourcesContent !== void 0) {
    flags.push(`--sources-content=${sourcesContent}`);
  }
  if (target) {
    flags.push(
      `--target=${
        validateAndJoinStringArray(
          Array.isArray(target) ? target : [target],
          "target",
        )
      }`,
    );
  }
  if (format) flags.push(`--format=${format}`);
  if (globalName) flags.push(`--global-name=${globalName}`);
  if (platform) flags.push(`--platform=${platform}`);
  if (tsconfigRaw) {
    flags.push(
      `--tsconfig-raw=${
        typeof tsconfigRaw === "string"
          ? tsconfigRaw
          : JSON.stringify(tsconfigRaw)
      }`,
    );
  }

  if (minify) flags.push("--minify");
  if (minifySyntax) flags.push("--minify-syntax");
  if (minifyWhitespace) flags.push("--minify-whitespace");
  if (minifyIdentifiers) flags.push("--minify-identifiers");
  if (lineLimit) flags.push(`--line-limit=${lineLimit}`);
  if (charset) flags.push(`--charset=${charset}`);
  if (treeShaking !== void 0) flags.push(`--tree-shaking=${treeShaking}`);
  if (ignoreAnnotations) flags.push(`--ignore-annotations`);
  if (drop) {
    for (const what of drop) {
      flags.push(`--drop:${validateStringValue(what, "drop")}`);
    }
  }
  if (dropLabels) {
    flags.push(
      `--drop-labels=${validateAndJoinStringArray(dropLabels, "drop label")}`,
    );
  }
  if (absPaths) {
    flags.push(
      `--abs-paths=${validateAndJoinStringArray(absPaths, "abs paths")}`,
    );
  }
  if (mangleProps) {
    flags.push(`--mangle-props=${jsRegExpToGoRegExp(mangleProps)}`);
  }
  if (reserveProps) {
    flags.push(`--reserve-props=${jsRegExpToGoRegExp(reserveProps)}`);
  }
  if (mangleQuoted !== void 0) flags.push(`--mangle-quoted=${mangleQuoted}`);

  if (jsx) flags.push(`--jsx=${jsx}`);
  if (jsxFactory) flags.push(`--jsx-factory=${jsxFactory}`);
  if (jsxFragment) flags.push(`--jsx-fragment=${jsxFragment}`);
  if (jsxImportSource) flags.push(`--jsx-import-source=${jsxImportSource}`);
  if (jsxDev) flags.push(`--jsx-dev`);
  if (jsxSideEffects) flags.push(`--jsx-side-effects`);

  if (define) {
    for (const key in define) {
      if (key.indexOf("=") >= 0) throw new Error(`Invalid define: ${key}`);
      flags.push(
        `--define:${key}=${validateStringValue(define[key], "define", key)}`,
      );
    }
  }
  if (logOverride) {
    for (const key in logOverride) {
      if (key.indexOf("=") >= 0) {
        throw new Error(`Invalid log override: ${key}`);
      }
      flags.push(
        `--log-override:${key}=${
          validateStringValue(logOverride[key], "log override", key)
        }`,
      );
    }
  }
  if (supported) {
    for (const key in supported) {
      if (key.indexOf("=") >= 0) throw new Error(`Invalid supported: ${key}`);
      const value = supported[key];
      if (typeof value !== "boolean") {
        throw new Error(
          `Expected value for supported ${
            quote(key)
          } to be a boolean, got ${typeof value} instead`,
        );
      }
      flags.push(`--supported:${key}=${value}`);
    }
  }
  if (pure) {
    for (const fn of pure) {
      flags.push(`--pure:${validateStringValue(fn, "pure")}`);
    }
  }
  if (keepNames) flags.push(`--keep-names`);
}

function flagsForBuildOptions(
  callName: string,
  options: types.BuildOptions,
  isTTY: boolean,
  logLevelDefault: types.LogLevel,
  writeDefault: boolean,
): {
  entries: [string, string][];
  flags: string[];
  write: boolean;
  stdinContents: Uint8Array | null;
  stdinResolveDir: string | null;
  absWorkingDir: string | undefined;
  nodePaths: string[];
  mangleCache: MangleCache | undefined;
} {
  const flags: string[] = [];
  const entries: [string, string][] = [];
  const keys: OptionKeys = Object.create(null);
  let stdinContents: Uint8Array | null = null;
  let stdinResolveDir: string | null = null;
  pushLogFlags(flags, options, keys, isTTY, logLevelDefault);
  pushCommonFlags(flags, options, keys);

  const sourcemap = getFlag(options, keys, "sourcemap", mustBeStringOrBoolean);
  const bundle = getFlag(options, keys, "bundle", mustBeBoolean);
  const splitting = getFlag(options, keys, "splitting", mustBeBoolean);
  const preserveSymlinks = getFlag(
    options,
    keys,
    "preserveSymlinks",
    mustBeBoolean,
  );
  const metafile = getFlag(options, keys, "metafile", mustBeBoolean);
  const outfile = getFlag(options, keys, "outfile", mustBeString);
  const outdir = getFlag(options, keys, "outdir", mustBeString);
  const outbase = getFlag(options, keys, "outbase", mustBeString);
  const tsconfig = getFlag(options, keys, "tsconfig", mustBeString);
  const resolveExtensions = getFlag(
    options,
    keys,
    "resolveExtensions",
    mustBeArrayOfStrings,
  );
  const nodePathsInput = getFlag(
    options,
    keys,
    "nodePaths",
    mustBeArrayOfStrings,
  );
  const mainFields = getFlag(options, keys, "mainFields", mustBeArrayOfStrings);
  const conditions = getFlag(options, keys, "conditions", mustBeArrayOfStrings);
  const external = getFlag(options, keys, "external", mustBeArrayOfStrings);
  const packages = getFlag(options, keys, "packages", mustBeString);
  const alias = getFlag(options, keys, "alias", mustBeObject);
  const loader = getFlag(options, keys, "loader", mustBeObject);
  const outExtension = getFlag(options, keys, "outExtension", mustBeObject);
  const publicPath = getFlag(options, keys, "publicPath", mustBeString);
  const entryNames = getFlag(options, keys, "entryNames", mustBeString);
  const chunkNames = getFlag(options, keys, "chunkNames", mustBeString);
  const assetNames = getFlag(options, keys, "assetNames", mustBeString);
  const inject = getFlag(options, keys, "inject", mustBeArrayOfStrings);
  const banner = getFlag(options, keys, "banner", mustBeObject);
  const footer = getFlag(options, keys, "footer", mustBeObject);
  const entryPoints = getFlag(options, keys, "entryPoints", mustBeEntryPoints);
  const absWorkingDir = getFlag(options, keys, "absWorkingDir", mustBeString);
  const stdin = getFlag(options, keys, "stdin", mustBeObject);
  const write = getFlag(options, keys, "write", mustBeBoolean) ?? writeDefault; // Default to true if not specified
  const allowOverwrite = getFlag(
    options,
    keys,
    "allowOverwrite",
    mustBeBoolean,
  );
  const mangleCache = getFlag(options, keys, "mangleCache", mustBeObject);
  keys.plugins = true; // "plugins" has already been read earlier
  checkForInvalidFlags(options, keys, `in ${callName}() call`);

  if (sourcemap) {
    flags.push(`--sourcemap${sourcemap === true ? "" : `=${sourcemap}`}`);
  }
  if (bundle) flags.push("--bundle");
  if (allowOverwrite) flags.push("--allow-overwrite");
  if (splitting) flags.push("--splitting");
  if (preserveSymlinks) flags.push("--preserve-symlinks");
  if (metafile) flags.push(`--metafile`);
  if (outfile) flags.push(`--outfile=${outfile}`);
  if (outdir) flags.push(`--outdir=${outdir}`);
  if (outbase) flags.push(`--outbase=${outbase}`);
  if (tsconfig) flags.push(`--tsconfig=${tsconfig}`);
  if (packages) flags.push(`--packages=${packages}`);
  if (resolveExtensions) {
    flags.push(
      `--resolve-extensions=${
        validateAndJoinStringArray(resolveExtensions, "resolve extension")
      }`,
    );
  }
  if (publicPath) flags.push(`--public-path=${publicPath}`);
  if (entryNames) flags.push(`--entry-names=${entryNames}`);
  if (chunkNames) flags.push(`--chunk-names=${chunkNames}`);
  if (assetNames) flags.push(`--asset-names=${assetNames}`);
  if (mainFields) {
    flags.push(
      `--main-fields=${validateAndJoinStringArray(mainFields, "main field")}`,
    );
  }
  if (conditions) {
    flags.push(
      `--conditions=${validateAndJoinStringArray(conditions, "condition")}`,
    );
  }
  if (external) {
    for (const name of external) {
      flags.push(`--external:${validateStringValue(name, "external")}`);
    }
  }
  if (alias) {
    for (const old in alias) {
      if (old.indexOf("=") >= 0) {
        throw new Error(`Invalid package name in alias: ${old}`);
      }
      flags.push(
        `--alias:${old}=${validateStringValue(alias[old], "alias", old)}`,
      );
    }
  }
  if (banner) {
    for (const type in banner) {
      if (type.indexOf("=") >= 0) {
        throw new Error(`Invalid banner file type: ${type}`);
      }
      flags.push(
        `--banner:${type}=${validateStringValue(banner[type], "banner", type)}`,
      );
    }
  }
  if (footer) {
    for (const type in footer) {
      if (type.indexOf("=") >= 0) {
        throw new Error(`Invalid footer file type: ${type}`);
      }
      flags.push(
        `--footer:${type}=${validateStringValue(footer[type], "footer", type)}`,
      );
    }
  }
  if (inject) {
    for (const path of inject) {
      flags.push(`--inject:${validateStringValue(path, "inject")}`);
    }
  }
  if (loader) {
    for (const ext in loader) {
      if (ext.indexOf("=") >= 0) {
        throw new Error(`Invalid loader extension: ${ext}`);
      }
      flags.push(
        `--loader:${ext}=${validateStringValue(loader[ext], "loader", ext)}`,
      );
    }
  }
  if (outExtension) {
    for (const ext in outExtension) {
      if (ext.indexOf("=") >= 0) {
        throw new Error(`Invalid out extension: ${ext}`);
      }
      flags.push(
        `--out-extension:${ext}=${
          validateStringValue(outExtension[ext], "out extension", ext)
        }`,
      );
    }
  }

  if (entryPoints) {
    if (Array.isArray(entryPoints)) {
      for (let i = 0, n = entryPoints.length; i < n; i++) {
        const entryPoint = entryPoints[i];
        if (typeof entryPoint === "object" && entryPoint !== null) {
          const entryPointKeys: OptionKeys = Object.create(null);
          const input = getFlag(entryPoint, entryPointKeys, "in", mustBeString);
          const output = getFlag(
            entryPoint,
            entryPointKeys,
            "out",
            mustBeString,
          );
          checkForInvalidFlags(
            entryPoint,
            entryPointKeys,
            "in entry point at index " + i,
          );
          if (input === undefined) {
            throw new Error(
              'Missing property "in" for entry point at index ' + i,
            );
          }
          if (output === undefined) {
            throw new Error(
              'Missing property "out" for entry point at index ' + i,
            );
          }
          entries.push([output, input]);
        } else {
          entries.push([
            "",
            validateStringValue(entryPoint, "entry point at index " + i),
          ]);
        }
      }
    } else {
      for (const key in entryPoints) {
        entries.push([
          key,
          validateStringValue(entryPoints[key], "entry point", key),
        ]);
      }
    }
  }

  if (stdin) {
    const stdinKeys: OptionKeys = Object.create(null);
    const contents = getFlag(
      stdin,
      stdinKeys,
      "contents",
      mustBeStringOrUint8Array,
    );
    const resolveDir = getFlag(stdin, stdinKeys, "resolveDir", mustBeString);
    const sourcefile = getFlag(stdin, stdinKeys, "sourcefile", mustBeString);
    const loader = getFlag(stdin, stdinKeys, "loader", mustBeString);
    checkForInvalidFlags(stdin, stdinKeys, 'in "stdin" object');

    if (sourcefile) flags.push(`--sourcefile=${sourcefile}`);
    if (loader) flags.push(`--loader=${loader}`);
    if (resolveDir) stdinResolveDir = resolveDir;
    if (typeof contents === "string") {
      stdinContents = protocol.encodeUTF8(contents);
    } else if (contents instanceof Uint8Array) stdinContents = contents;
  }

  const nodePaths: string[] = [];
  if (nodePathsInput) {
    for (let value of nodePathsInput) {
      value += "";
      nodePaths.push(value);
    }
  }

  return {
    entries,
    flags,
    write,
    stdinContents,
    stdinResolveDir,
    absWorkingDir,
    nodePaths,
    mangleCache: validateMangleCache(mangleCache),
  };
}

function flagsForTransformOptions(
  callName: string,
  options: types.TransformOptions,
  isTTY: boolean,
  logLevelDefault: types.LogLevel,
): {
  flags: string[];
  mangleCache: MangleCache | undefined;
} {
  const flags: string[] = [];
  const keys: OptionKeys = Object.create(null);
  pushLogFlags(flags, options, keys, isTTY, logLevelDefault);
  pushCommonFlags(flags, options, keys);

  const sourcemap = getFlag(options, keys, "sourcemap", mustBeStringOrBoolean);
  const sourcefile = getFlag(options, keys, "sourcefile", mustBeString);
  const loader = getFlag(options, keys, "loader", mustBeString);
  const banner = getFlag(options, keys, "banner", mustBeString);
  const footer = getFlag(options, keys, "footer", mustBeString);
  const mangleCache = getFlag(options, keys, "mangleCache", mustBeObject);
  checkForInvalidFlags(options, keys, `in ${callName}() call`);

  if (sourcemap) {
    flags.push(`--sourcemap=${sourcemap === true ? "external" : sourcemap}`);
  }
  if (sourcefile) flags.push(`--sourcefile=${sourcefile}`);
  if (loader) flags.push(`--loader=${loader}`);
  if (banner) flags.push(`--banner=${banner}`);
  if (footer) flags.push(`--footer=${footer}`);

  return {
    flags,
    mangleCache: validateMangleCache(mangleCache),
  };
}

export interface StreamIn {
  writeToStdin: (data: Uint8Array) => void;
  readFileSync?: (path: string, encoding: "utf8") => string;
  isSync: boolean;
  hasFS: boolean;
  esbuild: types.PluginBuild["esbuild"];
}

export interface StreamOut {
  readFromStdout: (data: Uint8Array) => void;
  afterClose: (error: Error | null) => void;
  service: StreamService;
}

export interface StreamFS {
  writeFile(
    contents: string | Uint8Array,
    callback: (path: string | null) => void,
  ): void;
  readFile(
    path: string,
    callback: (err: Error | null, contents: string | null) => void,
  ): void;
}

export interface Refs {
  ref(): void;
  unref(): void;
}

export interface StreamService {
  buildOrContext(args: {
    callName: string;
    refs: Refs | null;
    options: types.BuildOptions;
    isTTY: boolean;
    defaultWD: string;
    callback: (
      err: Error | null,
      res: types.BuildResult | types.BuildContext | null,
    ) => void;
  }): void;

  transform(args: {
    callName: string;
    refs: Refs | null;
    input: string | Uint8Array;
    options: types.TransformOptions;
    isTTY: boolean;
    fs: StreamFS;
    callback: (err: Error | null, res: types.TransformResult | null) => void;
  }): void;

  formatMessages(args: {
    callName: string;
    refs: Refs | null;
    messages: types.PartialMessage[];
    options: types.FormatMessagesOptions;
    callback: (err: Error | null, res: string[] | null) => void;
  }): void;

  analyzeMetafile(args: {
    callName: string;
    refs: Refs | null;
    metafile: string;
    options: types.AnalyzeMetafileOptions | undefined;
    callback: (err: Error | null, res: string | null) => void;
  }): void;
}

type CloseData = { didClose: boolean; reason: string };
// deno-lint-ignore no-explicit-any
type RequestCallback = (id: number, request: any) => Promise<void> | void;

// This can't use any promises in the main execution flow because it must work
// for both sync and async code. There is an exception for plugin code because
// that can't work in sync code anyway.
export function createChannel(streamIn: StreamIn): StreamOut {
  const requestCallbacksByKey: {
    [key: number]: { [command: string]: RequestCallback };
  } = {};
  const closeData: CloseData = { didClose: false, reason: "" };
  let responseCallbacks: {
    [id: number]: (error: string | null, response: protocol.Value) => void;
  } = {};
  let nextRequestID = 0;
  let nextBuildKey = 0;

  // Use a long-lived buffer to store stdout data
  let stdout = new Uint8Array(16 * 1024);
  let stdoutUsed = 0;
  const readFromStdout = (chunk: Uint8Array) => {
    // Append the chunk to the stdout buffer, growing it as necessary
    const limit = stdoutUsed + chunk.length;
    if (limit > stdout.length) {
      const swap = new Uint8Array(limit * 2);
      swap.set(stdout);
      stdout = swap;
    }
    stdout.set(chunk, stdoutUsed);
    stdoutUsed += chunk.length;

    // Process all complete (i.e. not partial) packets
    let offset = 0;
    while (offset + 4 <= stdoutUsed) {
      const length = protocol.readUInt32LE(stdout, offset);
      if (offset + 4 + length > stdoutUsed) {
        break;
      }
      offset += 4;
      handleIncomingPacket(stdout.subarray(offset, offset + length));
      offset += length;
    }
    if (offset > 0) {
      stdout.copyWithin(0, offset, stdoutUsed);
      stdoutUsed -= offset;
    }
  };

  const afterClose = (error: Error | null) => {
    // When the process is closed, fail all pending requests
    closeData.didClose = true;
    if (error) closeData.reason = ": " + (error.message || error);
    const text = "The service was stopped" + closeData.reason;
    for (const id in responseCallbacks) {
      responseCallbacks[id](text, null);
    }
    responseCallbacks = {};
  };

  const sendRequest = <Req, Res>(
    refs: Refs | null,
    value: Req,
    callback: (error: string | null, response: Res | null) => void,
  ): void => {
    if (closeData.didClose) {
      return callback(
        "The service is no longer running" + closeData.reason,
        null,
      );
    }
    const id = nextRequestID++;
    responseCallbacks[id] = (error, response) => {
      try {
        // deno-lint-ignore no-explicit-any
        callback(error, response as any);
      } finally {
        if (refs) refs.unref(); // Do this after the callback so the callback can extend the lifetime if needed
      }
    };
    if (refs) refs.ref();
    streamIn.writeToStdin(
      // deno-lint-ignore no-explicit-any
      protocol.encodePacket({ id, isRequest: true, value: value as any }),
    );
  };

  const sendResponse = (id: number, value: protocol.Value): void => {
    if (closeData.didClose) {
      throw new Error("The service is no longer running" + closeData.reason);
    }
    streamIn.writeToStdin(
      protocol.encodePacket({ id, isRequest: false, value }),
    );
  };

  const handleRequest = async (id: number, request: protocol.BuildRequest) => {
    // Catch exceptions in the code below so they get passed to the caller
    try {
      if ((request.command as string) === "ping") {
        sendResponse(id, {});
        return;
      }

      if (typeof request.key === "number") {
        const requestCallbacks = requestCallbacksByKey[request.key];
        if (!requestCallbacks) {
          // Ignore invalid commands for old builds that no longer exist.
          // This can happen when "context.cancel" and "context.dispose"
          // is called while esbuild is processing many files in parallel.
          // See https://github.com/evanw/esbuild/issues/3318 for details.
          return;
        }
        const callback = requestCallbacks[request.command];
        if (callback) {
          await callback(id, request);
          return;
        }
      }

      throw new Error(`Invalid command: ` + request.command);
    } catch (e) {
      const errors = [extractErrorMessageV8(e, streamIn, null, void 0, "")];
      try {
        // deno-lint-ignore no-explicit-any
        sendResponse(id, { errors } as any);
      } catch {
        // This may fail if the esbuild process is no longer running, but
        // that's ok. Catch and swallow this exception so that we don't
        // cause an unhandled promise rejection. Our caller isn't expecting
        // this call to fail and doesn't handle the promise rejection.
      }
    }
  };

  let isFirstPacket = true;

  const handleIncomingPacket = (bytes: Uint8Array): void => {
    // The first packet is a version check
    if (isFirstPacket) {
      isFirstPacket = false;

      // Validate the binary's version number to make sure esbuild was installed
      // correctly. This check was added because some people have reported
      // errors that appear to indicate an incorrect installation.
      const binaryVersion = String.fromCharCode(...bytes);
      if (binaryVersion !== ESBUILD_VERSION) {
        throw new Error(
          `Cannot start service: Host version "${ESBUILD_VERSION}" does not match binary version ${
            quote(binaryVersion)
          }`,
        );
      }
      return;
    }

    const packet = protocol.decodePacket(bytes);

    if (packet.isRequest) {
      handleRequest(
        packet.id,
        packet.value as unknown as protocol.BuildRequest,
      );
    } else {
      const callback = responseCallbacks[packet.id]!;
      delete responseCallbacks[packet.id];
      if (packet.value && (packet.value as { error?: string }).error) {
        callback((packet.value as { error: string }).error, {});
      } else callback(null, packet.value);
    }
  };

  const buildOrContext: StreamService["buildOrContext"] = (
    { callName, refs, options, isTTY, defaultWD, callback },
  ) => {
    let refCount = 0;
    const buildKey = nextBuildKey++;
    const requestCallbacks: { [command: string]: RequestCallback } = {};
    const buildRefs: Refs = {
      ref() {
        if (++refCount === 1) {
          if (refs) refs.ref();
        }
      },
      unref() {
        if (--refCount === 0) {
          delete requestCallbacksByKey[buildKey];
          if (refs) refs.unref();
        }
      },
    };
    requestCallbacksByKey[buildKey] = requestCallbacks;

    // Guard the whole "build" request with a temporary ref count bump. We
    // don't want the ref count to be bumped above zero and then back down
    // to zero before the callback is called.
    buildRefs.ref();
    buildOrContextImpl(
      callName,
      buildKey,
      sendRequest,
      sendResponse,
      buildRefs,
      streamIn,
      requestCallbacks,
      options,
      isTTY,
      defaultWD,
      (err, res) => {
        // Now that the initial "build" request is done, we can release our
        // temporary ref count bump. Any code that wants to extend the life
        // of the build will have to do so by explicitly retaining a count.
        try {
          callback(err, res);
        } finally {
          buildRefs.unref();
        }
      },
    );
  };

  const transform: StreamService["transform"] = (
    { callName, refs, input, options, isTTY, fs, callback },
  ) => {
    const details = createObjectStash();

    // Ideally the "transform()" API would be faster than calling "build()"
    // since it doesn't need to touch the file system. However, performance
    // measurements with large files on macOS indicate that sending the data
    // over the stdio pipe can be 2x slower than just using a temporary file.
    //
    // This appears to be an OS limitation. Both the JavaScript and Go code
    // are using large buffers but the pipe only writes data in 8kb chunks.
    // An investigation seems to indicate that this number is hard-coded into
    // the OS source code. Presumably files are faster because the OS uses
    // a larger chunk size, or maybe even reads everything in one syscall.
    //
    // The cross-over size where this starts to be faster is around 1mb on
    // my machine. In that case, this code tries to use a temporary file if
    // possible but falls back to sending the data over the stdio pipe if
    // that doesn't work.
    let start = (inputPath: string | null) => {
      try {
        if (typeof input !== "string" && !(input instanceof Uint8Array)) {
          throw new Error(
            'The input to "transform" must be a string or a Uint8Array',
          );
        }
        const {
          flags,
          mangleCache,
        } = flagsForTransformOptions(
          callName,
          options,
          isTTY,
          transformLogLevelDefault,
        );
        const request: protocol.TransformRequest = {
          command: "transform",
          flags,
          inputFS: inputPath !== null,
          input: inputPath !== null
            ? protocol.encodeUTF8(inputPath)
            : typeof input === "string"
            ? protocol.encodeUTF8(input)
            : input,
        };
        if (mangleCache) request.mangleCache = mangleCache;
        sendRequest<protocol.TransformRequest, protocol.TransformResponse>(
          refs,
          request,
          (error, response) => {
            if (error) return callback(new Error(error), null);
            const errors = replaceDetailsInMessages(response!.errors, details);
            const warnings = replaceDetailsInMessages(
              response!.warnings,
              details,
            );
            let outstanding = 1;
            const next = () => {
              if (--outstanding === 0) {
                const result: types.TransformResult = {
                  warnings,
                  code: response!.code,
                  map: response!.map,
                  mangleCache: undefined,
                  legalComments: undefined,
                };
                if ("legalComments" in response!) {
                  result.legalComments = response?.legalComments;
                }
                if (response!.mangleCache) {
                  result.mangleCache = response?.mangleCache;
                }
                callback(null, result);
              }
            };
            if (errors.length > 0) {
              return callback(
                failureErrorWithLog("Transform failed", errors, warnings),
                null,
              );
            }

            // Read the JavaScript file from the file system
            if (response!.codeFS) {
              outstanding++;
              fs.readFile(response!.code, (err, contents) => {
                if (err !== null) {
                  callback(err, null);
                } else {
                  response!.code = contents!;
                  next();
                }
              });
            }

            // Read the source map file from the file system
            if (response!.mapFS) {
              outstanding++;
              fs.readFile(response!.map, (err, contents) => {
                if (err !== null) {
                  callback(err, null);
                } else {
                  response!.map = contents!;
                  next();
                }
              });
            }

            next();
          },
        );
      } catch (e) {
        const flags: string[] = [];
        try {
          pushLogFlags(flags, options, {}, isTTY, transformLogLevelDefault);
        } catch {
          // This is expected to potentially fail if the options are invalid
        }
        const error = extractErrorMessageV8(e, streamIn, details, void 0, "");
        sendRequest(refs, { command: "error", flags, error }, () => {
          error.detail = details.load(error.detail);
          callback(failureErrorWithLog("Transform failed", [error], []), null);
        });
      }
    };
    // Check if the input is large enough to warrant using a file
    if (
      (typeof input === "string" || input instanceof Uint8Array) &&
      input.length > 1024 * 1024
    ) {
      const next = start;
      start = () => fs.writeFile(input, next);
    }
    start(null);
  };

  const formatMessages: StreamService["formatMessages"] = (
    { callName, refs, messages, options, callback },
  ) => {
    if (!options) {
      throw new Error(`Missing second argument in ${callName}() call`);
    }
    const keys: OptionKeys = {};
    const kind = getFlag(options, keys, "kind", mustBeString);
    const color = getFlag(options, keys, "color", mustBeBoolean);
    const terminalWidth = getFlag(
      options,
      keys,
      "terminalWidth",
      mustBeInteger,
    );
    checkForInvalidFlags(options, keys, `in ${callName}() call`);
    if (kind === void 0) {
      throw new Error(`Missing "kind" in ${callName}() call`);
    }
    if (kind !== "error" && kind !== "warning") {
      throw new Error(
        `Expected "kind" to be "error" or "warning" in ${callName}() call`,
      );
    }
    const request: protocol.FormatMsgsRequest = {
      command: "format-msgs",
      messages: sanitizeMessages(messages, "messages", null, "", terminalWidth),
      isWarning: kind === "warning",
    };
    if (color !== void 0) request.color = color;
    if (terminalWidth !== void 0) request.terminalWidth = terminalWidth;
    sendRequest<protocol.FormatMsgsRequest, protocol.FormatMsgsResponse>(
      refs,
      request,
      (error, response) => {
        if (error) return callback(new Error(error), null);
        callback(null, response!.messages);
      },
    );
  };

  const analyzeMetafile: StreamService["analyzeMetafile"] = (
    { callName, refs, metafile, options, callback },
  ) => {
    if (options === void 0) options = {};
    const keys: OptionKeys = {};
    const color = getFlag(options, keys, "color", mustBeBoolean);
    const verbose = getFlag(options, keys, "verbose", mustBeBoolean);
    checkForInvalidFlags(options, keys, `in ${callName}() call`);
    const request: protocol.AnalyzeMetafileRequest = {
      command: "analyze-metafile",
      metafile,
    };
    if (color !== void 0) request.color = color;
    if (verbose !== void 0) request.verbose = verbose;
    sendRequest<
      protocol.AnalyzeMetafileRequest,
      protocol.AnalyzeMetafileResponse
    >(
      refs,
      request,
      (error, response) => {
        if (error) return callback(new Error(error), null);
        callback(null, response!.result);
      },
    );
  };

  return {
    readFromStdout,
    afterClose,
    service: {
      buildOrContext,
      transform,
      formatMessages,
      analyzeMetafile,
    },
  };
}

function buildOrContextImpl(
  callName: string,
  buildKey: number,
  sendRequest: <Req, Res>(
    refs: Refs | null,
    value: Req,
    callback: (error: string | null, response: Res | null) => void,
  ) => void,
  sendResponse: (id: number, value: protocol.Value) => void,
  refs: Refs,
  streamIn: StreamIn,
  requestCallbacks: { [command: string]: RequestCallback },
  options: types.BuildOptions,
  isTTY: boolean,
  defaultWD: string,
  callback: (
    err: Error | null,
    res: types.BuildResult | types.BuildContext | null,
  ) => void,
): void {
  const details = createObjectStash();
  const isContext = callName === "context";

  const handleError = (e: Error, pluginName: string): void => {
    const flags: string[] = [];
    try {
      pushLogFlags(flags, options, {}, isTTY, buildLogLevelDefault);
    } catch {
      // This is expected to potentially fail if the options are invalid
    }
    const message = extractErrorMessageV8(
      e,
      streamIn,
      details,
      void 0,
      pluginName,
    );
    sendRequest(refs, { command: "error", flags, error: message }, () => {
      message.detail = details.load(message.detail);
      callback(
        failureErrorWithLog(
          isContext ? "Context failed" : "Build failed",
          [message],
          [],
        ),
        null,
      );
    });
  };

  let plugins: types.Plugin[] | undefined;
  if (typeof options === "object") {
    const value = options.plugins;
    if (value !== void 0) {
      if (!Array.isArray(value)) {
        return handleError(new Error(`"plugins" must be an array`), "");
      }
      plugins = value;
    }
  }

  if (plugins && plugins.length > 0) {
    if (streamIn.isSync) {
      return handleError(
        new Error("Cannot use plugins in synchronous API calls"),
        "",
      );
    }

    // Plugins can use async/await because they can't be run with "buildSync"
    handlePlugins(
      buildKey,
      sendRequest,
      sendResponse,
      refs,
      streamIn,
      requestCallbacks,
      options,
      plugins,
      details,
    ).then(
      (result) => {
        if (!result.ok) return handleError(result.error, result.pluginName);
        try {
          buildOrContextContinue(
            result.requestPlugins,
            result.runOnEndCallbacks,
            result.scheduleOnDisposeCallbacks,
          );
        } catch (e) {
          handleError(e as Error, "");
        }
      },
      (e) => handleError(e as Error, ""),
    );
    return;
  }

  try {
    buildOrContextContinue(null, (_result, done) => done([], []), () => {});
  } catch (e) {
    handleError(e as Error, "");
  }

  // "buildOrContext" cannot be written using async/await due to "buildSync"
  // and must be written in continuation-passing style instead
  function buildOrContextContinue(
    requestPlugins: protocol.BuildPlugin[] | null,
    runOnEndCallbacks: RunOnEndCallbacks,
    scheduleOnDisposeCallbacks: () => void,
  ) {
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

    // Construct the request
    const request: protocol.BuildRequest = {
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
    if (requestPlugins) request.plugins = requestPlugins;
    if (mangleCache) request.mangleCache = mangleCache;

    // Factor out response handling so it can be reused for rebuilds
    const buildResponseToResult = (
      response: protocol.BuildResponse | null,
      callback: (
        error: types.BuildFailure | null,
        result: types.BuildResult | null,
        onEndErrors: types.Message[],
        onEndWarnings: types.Message[],
      ) => void,
    ): void => {
      const result: types.BuildResult = {
        errors: replaceDetailsInMessages(response!.errors, details),
        warnings: replaceDetailsInMessages(response!.warnings, details),
        outputFiles: undefined,
        metafile: undefined,
        mangleCache: undefined,
      };
      const originalErrors = result.errors.slice();
      const originalWarnings = result.warnings.slice();
      if (response!.outputFiles) {
        result.outputFiles = response!.outputFiles.map(convertOutputFiles);
      }
      if (response!.metafile && response!.metafile.length) {
        result.metafile = parseJSON(response!.metafile) as types.Metafile;
      }
      if (response!.mangleCache) result.mangleCache = response!.mangleCache;
      if (response!.writeToStdout !== void 0) {
        console.log(
          protocol.decodeUTF8(response!.writeToStdout).replace(/\n$/, ""),
        );
      }
      runOnEndCallbacks(result, (onEndErrors, onEndWarnings) => {
        if (originalErrors.length > 0 || onEndErrors.length > 0) {
          const error = failureErrorWithLog(
            "Build failed",
            originalErrors.concat(onEndErrors),
            originalWarnings.concat(onEndWarnings),
          );
          return callback(error, null, onEndErrors, onEndWarnings);
        }
        callback(null, result, onEndErrors, onEndWarnings);
      });
    };

    // In context mode, Go runs the "onEnd" callbacks instead of JavaScript
    let latestResultPromise: Promise<types.BuildResult> | undefined;
    let provideLatestResult:
      | ((
        error: types.BuildFailure | null,
        result: types.BuildResult | null,
      ) => void)
      | undefined;
    if (isContext) {
      requestCallbacks["on-end"] = (id, request: protocol.OnEndRequest) =>
        new Promise((resolve) => {
          buildResponseToResult(
            request,
            (err, result, onEndErrors, onEndWarnings) => {
              const response: protocol.OnEndResponse = {
                errors: onEndErrors,
                warnings: onEndWarnings,
              };
              if (provideLatestResult) provideLatestResult(err, result);
              latestResultPromise = undefined;
              provideLatestResult = undefined;
              sendResponse(id, response as unknown as protocol.Value);
              resolve();
            },
          );
        });
    }

    sendRequest<protocol.BuildRequest, protocol.BuildResponse>(
      refs,
      request,
      (error, response) => {
        if (error) return callback(new Error(error), null);
        if (!isContext) {
          return buildResponseToResult(response!, (err, res) => {
            scheduleOnDisposeCallbacks();
            return callback(err, res);
          });
        }

        // Construct a context object
        if (response!.errors.length > 0) {
          return callback(
            failureErrorWithLog(
              "Context failed",
              response!.errors,
              response!.warnings,
            ),
            null,
          );
        }
        let didDispose = false;
        const result: types.BuildContext = {
          rebuild: () => {
            if (!latestResultPromise) {
              latestResultPromise = new Promise((resolve, reject) => {
                let settlePromise: (() => void) | undefined;
                provideLatestResult = (err, result) => {
                  if (!settlePromise) {
                    settlePromise = () => err ? reject(err) : resolve(result!);
                  }
                };
                const triggerAnotherBuild = (): void => {
                  const request: protocol.RebuildRequest = {
                    command: "rebuild",
                    key: buildKey,
                  };
                  sendRequest<
                    protocol.RebuildRequest,
                    protocol.RebuildResponse
                  >(
                    refs,
                    request,
                    (error, _response) => {
                      if (error) {
                        reject(new Error(error));
                      } else if (settlePromise) {
                        // It's possible to settle the promise that we returned from
                        // this "rebuild()" function earlier than this point. However,
                        // at that point the user could call "rebuild()" again which
                        // would unexpectedly merge with the same build that's still
                        // ongoing. To prevent that, we defer settling the promise
                        // until now when we know that the build has finished.
                        settlePromise();
                      } else {
                        // When we call "rebuild()", we call out to the Go "Rebuild()"
                        // API over IPC. That may trigger a build, but may also "join"
                        // an existing build. At some point the Go code sends us an
                        // "on-end" message with the build result to tell us to run
                        // our "onEnd" plugins. We capture that build result and return
                        // it here.
                        //
                        // However, there's a potential problem: For performance, the
                        // Go code will only send us the result if it's needed, which
                        // only happens if there are "onEnd" callbacks or if "rebuild"
                        // was called. So there's a race where the following things
                        // happen:
                        //
                        // 1. Go starts a rebuild (e.g. due to watch mode)
                        // 2. JS calls "rebuild()"
                        // 3. Go ends the build and starts Go's "OnEnd" callback
                        // 4. Go's "OnEnd" callback sees no need to send the result
                        // 5. JS asks Go to rebuild, which merges with the existing build
                        // 6. Go's existing build ends
                        // 7. The merged build ends, which wakes up JS and ends up here
                        //
                        // In that situation we didn't get an "on-end" message since
                        // Go thought it wasn't necessary. In that situation, we
                        // trigger another rebuild below so that Go will (almost
                        // surely) send us an "on-end" message next time. I suspect
                        // that this is a very rare case, so the performance impact
                        // of building twice shouldn't really matter. It also only
                        // happens when "rebuild()" is used with "watch()" and/or
                        // "serve()".
                        triggerAnotherBuild();
                      }
                    },
                  );
                };
                triggerAnotherBuild();
              });
            }
            return latestResultPromise;
          },

          watch: (options = {}) =>
            new Promise((resolve, reject) => {
              if (!streamIn.hasFS) {
                throw new Error(
                  `Cannot use the "watch" API in this environment`,
                );
              }
              const keys: OptionKeys = {};
              const delay = getFlag(options, keys, "delay", mustBeInteger);
              checkForInvalidFlags(options, keys, `in watch() call`);
              const request: protocol.WatchRequest = {
                command: "watch",
                key: buildKey,
              };
              if (delay) request.delay = delay;
              sendRequest<protocol.WatchRequest, null>(
                refs,
                request,
                (error) => {
                  if (error) reject(new Error(error));
                  else resolve(undefined);
                },
              );
            }),

          serve: (options = {}) =>
            new Promise((resolve, reject) => {
              if (!streamIn.hasFS) {
                throw new Error(
                  `Cannot use the "serve" API in this environment`,
                );
              }
              const keys: OptionKeys = {};
              const port = getFlag(
                options,
                keys,
                "port",
                mustBeValidPortNumber,
              );
              const host = getFlag(options, keys, "host", mustBeString);
              const servedir = getFlag(options, keys, "servedir", mustBeString);
              const keyfile = getFlag(options, keys, "keyfile", mustBeString);
              const certfile = getFlag(options, keys, "certfile", mustBeString);
              const fallback = getFlag(options, keys, "fallback", mustBeString);
              const cors = getFlag(options, keys, "cors", mustBeObject);
              const onRequest = getFlag(
                options,
                keys,
                "onRequest",
                mustBeFunction as (value: unknown) => string | null,
              );
              checkForInvalidFlags(options, keys, `in serve() call`);

              const request: protocol.ServeRequest = {
                command: "serve",
                key: buildKey,
                onRequest: !!onRequest,
              };
              if (port !== void 0) request.port = port;
              if (host !== void 0) request.host = host;
              if (servedir !== void 0) request.servedir = servedir;
              if (keyfile !== void 0) request.keyfile = keyfile;
              if (certfile !== void 0) request.certfile = certfile;
              if (fallback !== void 0) request.fallback = fallback;

              if (cors) {
                const corsKeys: OptionKeys = {};
                const origin = getFlag(
                  cors,
                  corsKeys,
                  "origin",
                  mustBeStringOrArrayOfStrings,
                );
                checkForInvalidFlags(cors, corsKeys, `on "cors" object`);
                if (Array.isArray(origin)) request.corsOrigin = origin;
                else if (origin !== void 0) request.corsOrigin = [origin];
              }

              sendRequest<protocol.ServeRequest, protocol.ServeResponse>(
                refs,
                request,
                (error, response) => {
                  if (error) return reject(new Error(error));
                  if (onRequest) {
                    requestCallbacks["serve-request"] = (
                      id,
                      request: protocol.OnServeRequest,
                    ) => {
                      onRequest(request.args);
                      sendResponse(id, {});
                    };
                  }
                  resolve(response!);
                },
              );
            }),

          cancel: () =>
            new Promise((resolve) => {
              if (didDispose) return resolve();
              const request: protocol.CancelRequest = {
                command: "cancel",
                key: buildKey,
              };
              sendRequest<protocol.CancelRequest, null>(refs, request, () => {
                resolve(); // We don't care about errors here
              });
            }),

          dispose: () =>
            new Promise((resolve) => {
              if (didDispose) return resolve();
              didDispose = true; // Don't dispose more than once
              const request: protocol.DisposeRequest = {
                command: "dispose",
                key: buildKey,
              };
              sendRequest<protocol.DisposeRequest, null>(refs, request, () => {
                resolve(); // We don't care about errors here
                scheduleOnDisposeCallbacks();

                // Only remove the reference here when we know the Go code has seen
                // this "dispose" call. We don't want to remove any registered
                // callbacks before that point because the Go code might still be
                // sending us events. If we remove the reference earlier then we
                // will return errors for those events, which may end up being
                // printed to the terminal where the user can see them, which would
                // be very confusing.
                refs.unref();
              });
            }),
        };
        refs.ref(); // Keep a reference until "dispose" is called
        callback(null, result);
      },
    );
  }
}

type RunOnEndCallbacks = (
  result: types.BuildResult,
  done: (errors: types.Message[], warnings: types.Message[]) => void,
) => void;

const handlePlugins = async (
  buildKey: number,
  sendRequest: <Req, Res>(
    refs: Refs | null,
    value: Req,
    callback: (error: string | null, response: Res | null) => void,
  ) => void,
  sendResponse: (id: number, value: protocol.Value) => void,
  refs: Refs,
  streamIn: StreamIn,
  requestCallbacks: { [command: string]: RequestCallback },
  initialOptions: types.BuildOptions,
  plugins: types.Plugin[],
  details: ObjectStash,
): Promise<
  | {
    ok: true;
    requestPlugins: protocol.BuildPlugin[];
    runOnEndCallbacks: RunOnEndCallbacks;
    scheduleOnDisposeCallbacks: () => void;
  }
  | { ok: false; error: Error; pluginName: string }
> => {
  const onStartCallbacks: {
    name: string;
    note: () => types.Note | undefined;
    callback: () =>
      | types.OnStartResult
      | null
      | void
      | Promise<types.OnStartResult | null | void>;
  }[] = [];

  const onEndCallbacks: {
    name: string;
    note: () => types.Note | undefined;
    callback: (
      result: types.BuildResult,
    ) =>
      | types.OnEndResult
      | null
      | void
      | Promise<types.OnEndResult | null | void>;
  }[] = [];

  const onResolveCallbacks: {
    [id: number]: {
      name: string;
      note: () => types.Note | undefined;
      callback: (
        args: types.OnResolveArgs,
      ) =>
        | types.OnResolveResult
        | null
        | undefined
        | Promise<types.OnResolveResult | null | undefined>;
    };
  } = {};

  const onLoadCallbacks: {
    [id: number]: {
      name: string;
      note: () => types.Note | undefined;
      callback: (
        args: types.OnLoadArgs,
      ) =>
        | types.OnLoadResult
        | null
        | undefined
        | Promise<types.OnLoadResult | null | undefined>;
    };
  } = {};

  const onDisposeCallbacks: (() => void)[] = [];
  let nextCallbackID = 0;
  let i = 0;
  const requestPlugins: protocol.BuildPlugin[] = [];
  let isSetupDone = false;

  // Clone the plugin array to guard against mutation during iteration
  plugins = [...plugins];

  for (const item of plugins) {
    const keys: OptionKeys = {};
    if (typeof item !== "object") {
      throw new Error(`Plugin at index ${i} must be an object`);
    }
    const name = getFlag(item, keys, "name", mustBeString);
    if (typeof name !== "string" || name === "") {
      throw new Error(`Plugin at index ${i} is missing a name`);
    }
    try {
      const setup = getFlag(
        item,
        keys,
        "setup",
        mustBeFunction as (value: unknown) => string | null,
      );
      if (typeof setup !== "function") {
        throw new Error(`Plugin is missing a setup function`);
      }
      checkForInvalidFlags(item, keys, `on plugin ${quote(name)}`);

      const plugin: protocol.BuildPlugin = {
        name,
        onStart: false,
        onEnd: false,
        onResolve: [],
        onLoad: [],
      };
      i++;

      const resolve = (
        path: string,
        options: types.ResolveOptions = {},
      ): Promise<types.ResolveResult> => {
        if (!isSetupDone) {
          throw new Error(
            'Cannot call "resolve" before plugin setup has completed',
          );
        }
        if (typeof path !== "string") {
          throw new Error(`The path to resolve must be a string`);
        }
        const keys: OptionKeys = Object.create(null);
        const pluginName = getFlag(options, keys, "pluginName", mustBeString);
        const importer = getFlag(options, keys, "importer", mustBeString);
        const namespace = getFlag(options, keys, "namespace", mustBeString);
        const resolveDir = getFlag(options, keys, "resolveDir", mustBeString);
        const kind = getFlag(options, keys, "kind", mustBeString);
        const pluginData = getFlag(options, keys, "pluginData", canBeAnything);
        const importAttributes = getFlag(options, keys, "with", mustBeObject);
        checkForInvalidFlags(options, keys, "in resolve() call");

        return new Promise((resolve, reject) => {
          const request: protocol.ResolveRequest = {
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
          if (pluginData != null) {
            request.pluginData = details.store(pluginData);
          }
          if (importAttributes != null) {
            request.with = sanitizeStringMap(importAttributes, "with");
          }

          sendRequest<protocol.ResolveRequest, protocol.ResolveResponse>(
            refs,
            request,
            (error, response) => {
              if (error !== null) reject(new Error(error));
              else {
                resolve({
                  errors: replaceDetailsInMessages(response!.errors, details),
                  warnings: replaceDetailsInMessages(
                    response!.warnings,
                    details,
                  ),
                  path: response!.path,
                  external: response!.external,
                  sideEffects: response!.sideEffects,
                  namespace: response!.namespace,
                  suffix: response!.suffix,
                  pluginData: details.load(response!.pluginData),
                });
              }
            },
          );
        });
      };

      const promise = setup({
        initialOptions,

        resolve,

        onStart(callback) {
          const registeredText =
            `This error came from the "onStart" callback registered here:`;
          const registeredNote = extractCallerV8(
            new Error(registeredText),
            streamIn,
            "onStart",
          );
          onStartCallbacks.push({
            name: name!,
            callback,
            note: registeredNote,
          });
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
          onEndCallbacks.push({ name: name!, callback, note: registeredNote });
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
          const keys: OptionKeys = {};
          const filter = getFlag(options, keys, "filter", mustBeRegExp);
          const namespace = getFlag(options, keys, "namespace", mustBeString);
          checkForInvalidFlags(
            options,
            keys,
            `in onResolve() call for plugin ${quote(name)}`,
          );
          if (filter == null) {
            throw new Error(`onResolve() call is missing a filter`);
          }
          const id = nextCallbackID++;
          onResolveCallbacks[id] = {
            name: name!,
            callback,
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
          const keys: OptionKeys = {};
          const filter = getFlag(options, keys, "filter", mustBeRegExp);
          const namespace = getFlag(options, keys, "namespace", mustBeString);
          checkForInvalidFlags(
            options,
            keys,
            `in onLoad() call for plugin ${quote(name)}`,
          );
          if (filter == null) {
            throw new Error(`onLoad() call is missing a filter`);
          }
          const id = nextCallbackID++;
          onLoadCallbacks[id] = { name: name!, callback, note: registeredNote };
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

      // Await a returned promise if there was one. This allows plugins to do
      // some asynchronous setup while still retaining the ability to modify
      // the build options. This deliberately serializes asynchronous plugin
      // setup instead of running them concurrently so that build option
      // modifications are easier to reason about.
      if (promise) await promise;

      requestPlugins.push(plugin);
    } catch (e) {
      return { ok: false, error: e as Error, pluginName: name };
    }
  }

  requestCallbacks["on-start"] = async (
    id,
    _request: protocol.OnStartRequest,
  ) => {
    // Reset the "pluginData" map before each new build to avoid a memory leak.
    // This is done before each new build begins instead of after each build ends
    // because I believe the current API doesn't restrict when you can call
    // "resolve" and there may be some uses of it that call it around when the
    // build ends, and we don't want to accidentally break those use cases.
    details.clear();

    const response: protocol.OnStartResponse = { errors: [], warnings: [] };
    await Promise.all(onStartCallbacks.map(async ({ name, callback, note }) => {
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
          const keys: OptionKeys = {};
          const errors = getFlag(result, keys, "errors", mustBeArray);
          const warnings = getFlag(result, keys, "warnings", mustBeArray);
          checkForInvalidFlags(
            result,
            keys,
            `from onStart() callback in plugin ${quote(name)}`,
          );

          if (errors != null) {
            response.errors!.push(
              ...sanitizeMessages(errors, "errors", details, name, undefined),
            );
          }
          if (warnings != null) {
            response.warnings!.push(
              ...sanitizeMessages(
                warnings,
                "warnings",
                details,
                name,
                undefined,
              ),
            );
          }
        }
      } catch (e) {
        response.errors!.push(
          extractErrorMessageV8(e, streamIn, details, note && note(), name),
        );
      }
    }));
    sendResponse(id, response as protocol.Value);
  };

  requestCallbacks["on-resolve"] = async (
    id,
    request: protocol.OnResolveRequest,
  ) => {
    let response: protocol.OnResolveResponse = {}, name = "", callback, note;
    for (const id of request.ids) {
      try {
        ({ name, callback, note } = onResolveCallbacks[id]);
        const result = await callback({
          path: request.path,
          importer: request.importer,
          namespace: request.namespace,
          resolveDir: request.resolveDir,
          kind: request.kind,
          pluginData: details.load(request.pluginData),
          with: request.with,
        });

        if (result != null) {
          if (typeof result !== "object") {
            throw new Error(
              `Expected onResolve() callback in plugin ${
                quote(name)
              } to return an object`,
            );
          }
          const keys: OptionKeys = {};
          const pluginName = getFlag(result, keys, "pluginName", mustBeString);
          const path = getFlag(result, keys, "path", mustBeString);
          const namespace = getFlag(result, keys, "namespace", mustBeString);
          const suffix = getFlag(result, keys, "suffix", mustBeString);
          const external = getFlag(result, keys, "external", mustBeBoolean);
          const sideEffects = getFlag(
            result,
            keys,
            "sideEffects",
            mustBeBoolean,
          );
          const pluginData = getFlag(result, keys, "pluginData", canBeAnything);
          const errors = getFlag(result, keys, "errors", mustBeArray);
          const warnings = getFlag(result, keys, "warnings", mustBeArray);
          const watchFiles = getFlag(
            result,
            keys,
            "watchFiles",
            mustBeArrayOfStrings,
          );
          const watchDirs = getFlag(
            result,
            keys,
            "watchDirs",
            mustBeArrayOfStrings,
          );
          checkForInvalidFlags(
            result,
            keys,
            `from onResolve() callback in plugin ${quote(name)}`,
          );

          response.id = id;
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
            response.errors = sanitizeMessages(
              errors,
              "errors",
              details,
              name,
              undefined,
            );
          }
          if (warnings != null) {
            response.warnings = sanitizeMessages(
              warnings,
              "warnings",
              details,
              name,
              undefined,
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
          id,
          errors: [
            extractErrorMessageV8(e, streamIn, details, note && note(), name),
          ],
        };
        break;
      }
    }
    sendResponse(id, response as protocol.Value);
  };

  requestCallbacks["on-load"] = async (id, request: protocol.OnLoadRequest) => {
    let response: protocol.OnLoadResponse = {}, name = "", callback, note;
    for (const id of request.ids) {
      try {
        ({ name, callback, note } = onLoadCallbacks[id]);
        const result = await callback({
          path: request.path,
          namespace: request.namespace,
          suffix: request.suffix,
          pluginData: details.load(request.pluginData),
          with: request.with,
        });

        if (result != null) {
          if (typeof result !== "object") {
            throw new Error(
              `Expected onLoad() callback in plugin ${
                quote(name)
              } to return an object`,
            );
          }
          const keys: OptionKeys = {};
          const pluginName = getFlag(result, keys, "pluginName", mustBeString);
          const contents = getFlag(
            result,
            keys,
            "contents",
            mustBeStringOrUint8Array,
          );
          const resolveDir = getFlag(result, keys, "resolveDir", mustBeString);
          const pluginData = getFlag(result, keys, "pluginData", canBeAnything);
          const loader = getFlag(result, keys, "loader", mustBeString);
          const errors = getFlag(result, keys, "errors", mustBeArray);
          const warnings = getFlag(result, keys, "warnings", mustBeArray);
          const watchFiles = getFlag(
            result,
            keys,
            "watchFiles",
            mustBeArrayOfStrings,
          );
          const watchDirs = getFlag(
            result,
            keys,
            "watchDirs",
            mustBeArrayOfStrings,
          );
          checkForInvalidFlags(
            result,
            keys,
            `from onLoad() callback in plugin ${quote(name)}`,
          );

          response.id = id;
          if (pluginName != null) response.pluginName = pluginName;
          if (contents instanceof Uint8Array) response.contents = contents;
          else if (contents != null) {
            response.contents = protocol.encodeUTF8(contents);
          }
          if (resolveDir != null) response.resolveDir = resolveDir;
          if (pluginData != null) {
            response.pluginData = details.store(pluginData);
          }
          if (loader != null) response.loader = loader;
          if (errors != null) {
            response.errors = sanitizeMessages(
              errors,
              "errors",
              details,
              name,
              undefined,
            );
          }
          if (warnings != null) {
            response.warnings = sanitizeMessages(
              warnings,
              "warnings",
              details,
              name,
              undefined,
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
          id,
          errors: [
            extractErrorMessageV8(e, streamIn, details, note && note(), name),
          ],
        };
        break;
      }
    }
    sendResponse(id, response as protocol.Value);
  };

  let runOnEndCallbacks: RunOnEndCallbacks = (_result, done) => done([], []);

  if (onEndCallbacks.length > 0) {
    runOnEndCallbacks = (result, done) => {
      (async () => {
        const onEndErrors: types.Message[] = [];
        const onEndWarnings: types.Message[] = [];

        for (const { name, callback, note } of onEndCallbacks) {
          let newErrors: types.Message[] | undefined;
          let newWarnings: types.Message[] | undefined;

          try {
            const value = await callback(result);

            if (value != null) {
              if (typeof value !== "object") {
                throw new Error(
                  `Expected onEnd() callback in plugin ${
                    quote(name)
                  } to return an object`,
                );
              }
              const keys: OptionKeys = {};
              const errors = getFlag(value, keys, "errors", mustBeArray);
              const warnings = getFlag(value, keys, "warnings", mustBeArray);
              checkForInvalidFlags(
                value,
                keys,
                `from onEnd() callback in plugin ${quote(name)}`,
              );

              if (errors != null) {
                newErrors = sanitizeMessages(
                  errors,
                  "errors",
                  details,
                  name,
                  undefined,
                );
              }
              if (warnings != null) {
                newWarnings = sanitizeMessages(
                  warnings,
                  "warnings",
                  details,
                  name,
                  undefined,
                );
              }
            }
          } catch (e) {
            newErrors = [
              extractErrorMessageV8(e, streamIn, details, note && note(), name),
            ];
          }

          // Try adding the errors and warnings to the result object, but
          // continue if something goes wrong. If error-reporting has errors
          // then nothing can help us...
          if (newErrors) {
            onEndErrors.push(...newErrors);
            try {
              result.errors.push(...newErrors);
            } catch {
              // Ignore errors when adding errors (e.g., if errors is frozen)
            }
          }
          if (newWarnings) {
            onEndWarnings.push(...newWarnings);
            try {
              result.warnings.push(...newWarnings);
            } catch {
              // Ignore errors when adding warnings (e.g., if warnings is frozen)
            }
          }
        }

        done(onEndErrors, onEndWarnings);
      })();
    };
  }

  const scheduleOnDisposeCallbacks = (): void => {
    // Run each "onDispose" callback with its own call stack
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
};

// This stores JavaScript objects on the JavaScript side and temporarily
// substitutes them with an integer that can be passed through the Go side
// and back. That way we can associate JavaScript objects with Go objects
// even if the JavaScript objects aren't serializable. And we also avoid
// the overhead of serializing large JavaScript objects.
interface ObjectStash {
  clear(): void;
  load(id: number): unknown;
  store(value: unknown): number;
}

function createObjectStash(): ObjectStash {
  const map = new Map<number, unknown>();
  let nextID = 0;
  return {
    clear() {
      map.clear();
    },
    load(id) {
      return map.get(id);
    },
    store(value) {
      if (value === void 0) return -1;
      const id = nextID++;
      map.set(id, value);
      return id;
    },
  };
}

function extractCallerV8(
  e: Error,
  streamIn: StreamIn,
  ident: string,
): () => types.Note | undefined {
  let note: types.Note | undefined;
  let tried = false;
  return () => {
    if (tried) return note;
    tried = true;
    try {
      const lines = (e.stack + "").split("\n");
      lines.splice(1, 1);
      const location = parseStackLinesV8(streamIn, lines, ident);
      if (location) {
        note = { text: e.message, location };
        return note;
      }
    } catch {
      // Ignore errors when parsing stack traces
    }
  };
}

function extractErrorMessageV8(
  e: unknown,
  streamIn: StreamIn,
  stash: ObjectStash | null,
  note: types.Note | undefined,
  pluginName: string,
): types.Message {
  let text = "Internal error";
  let location: types.Location | null = null;

  try {
    text = ((e && (e as Error).message) || e) + "";
  } catch {
    // Ignore errors when extracting error message
  }

  // Optionally attempt to extract the file from the stack trace, works in V8/node
  try {
    location = parseStackLinesV8(
      streamIn,
      ((e as Error).stack + "").split("\n"),
      "",
    );
  } catch {
    // Ignore errors when parsing stack traces
  }

  return {
    id: "",
    pluginName,
    text,
    location,
    notes: note ? [note] : [],
    detail: stash ? stash.store(e) : -1,
  };
}

function parseStackLinesV8(
  streamIn: StreamIn,
  lines: string[],
  ident: string,
): types.Location | null {
  const at = "    at ";

  // Check to see if this looks like a V8 stack trace
  if (
    streamIn.readFileSync && !lines[0].startsWith(at) && lines[1].startsWith(at)
  ) {
    for (let i = 1; i < lines.length; i++) {
      let line = lines[i];
      if (!line.startsWith(at)) continue;
      line = line.slice(at.length);
      while (true) {
        // Unwrap a function name
        let match = /^(?:new |async )?\S+ \((.*)\)$/.exec(line);
        if (match) {
          line = match[1];
          continue;
        }

        // Unwrap an eval wrapper
        match = /^eval at \S+ \((.*)\)(?:, \S+:\d+:\d+)?$/.exec(line);
        if (match) {
          line = match[1];
          continue;
        }

        // Match on the file location
        match = /^(\S+):(\d+):(\d+)$/.exec(line);
        if (match) {
          let contents;
          try {
            contents = streamIn.readFileSync(match[1], "utf8");
          } catch {
            // Ignore errors when reading file
            break;
          }
          const lineText =
            contents.split(/\r\n|\r|\n|\u2028|\u2029/)[+match[2] - 1] ||
            "";
          const column = +match[3] - 1;
          const length = lineText.slice(column, column + ident.length) === ident
            ? ident.length
            : 0;
          return {
            file: match[1],
            namespace: "file",
            line: +match[2],
            column: protocol.encodeUTF8(lineText.slice(0, column)).length,
            length: protocol.encodeUTF8(lineText.slice(column, column + length))
              .length,
            lineText: lineText + "\n" + lines.slice(1).join("\n"),
            suggestion: "",
          };
        }
        break;
      }
    }
  }

  return null;
}

function failureErrorWithLog(
  text: string,
  errors: types.Message[],
  warnings: types.Message[],
): types.BuildFailure {
  const limit = 5;
  text += errors.length < 1
    ? ""
    : ` with ${errors.length} error${errors.length < 2 ? "" : "s"}:` +
      errors.slice(0, limit + 1).map((e, i) => {
        if (i === limit) return "\n...";
        if (!e.location) return `\nerror: ${e.text}`;
        const { file, line, column } = e.location;
        const pluginText = e.pluginName ? `[plugin: ${e.pluginName}] ` : "";
        return `\n${file}:${line}:${column}: ERROR: ${pluginText}${e.text}`;
      }).join("");
  const error: Error & {
    errors?: types.Message[];
    warnings?: types.Message[];
  } = new Error(text);

  // Use a getter instead of a plain property so that when the error is thrown
  // without being caught and the node process exits, the error objects aren't
  // printed. The error objects are pretty big and not helpful because a) esbuild
  // already prints errors to stderr by default and b) the error summary already
  // has a more helpful abbreviated form of the error messages.
  for (
    const [key, value] of [["errors", errors], ["warnings", warnings]] as const
  ) {
    Object.defineProperty(error, key, {
      configurable: true,
      enumerable: true,
      get: () => value,
      set: (v) =>
        Object.defineProperty(error, key, {
          configurable: true,
          enumerable: true,
          value: v,
        }),
    });
  }

  return error as types.BuildFailure;
}

function replaceDetailsInMessages(
  messages: types.Message[],
  stash: ObjectStash,
): types.Message[] {
  for (const message of messages) {
    message.detail = stash.load(message.detail);
  }
  return messages;
}

function sanitizeLocation(
  location: types.PartialMessage["location"],
  where: string,
  terminalWidth: number | undefined,
): types.Message["location"] {
  if (location == null) return null;

  const keys: OptionKeys = {};
  const file = getFlag(location, keys, "file", mustBeString);
  const namespace = getFlag(location, keys, "namespace", mustBeString);
  const line = getFlag(location, keys, "line", mustBeInteger);
  const column = getFlag(location, keys, "column", mustBeInteger);
  const length = getFlag(location, keys, "length", mustBeInteger);
  let lineText = getFlag(location, keys, "lineText", mustBeString);
  const suggestion = getFlag(location, keys, "suggestion", mustBeString);
  checkForInvalidFlags(location, keys, where);

  // Performance hack: Some people pass enormous minified files as the line
  // text with a column near the beginning of the line and then complain
  // when this function is slow. The slowness comes from serializing a huge
  // string. But the vast majority of that string is unnecessary. Try to
  // detect when this is the case and trim the string before serialization
  // to avoid the performance hit. See: https://github.com/evanw/esbuild/issues/3467
  if (lineText) {
    // Try to conservatively guess the maximum amount of relevant text
    const relevantASCII = lineText.slice(
      0,
      (column && column > 0 ? column : 0) +
        (length && length > 0 ? length : 0) +
        (terminalWidth && terminalWidth > 0 ? terminalWidth : 80),
    );

    // Make sure it's ASCII (so the byte-oriented column and length values
    // are correct) and that there are no newlines (so that our logging code
    // doesn't look at the end of the string)
    if (!/[\x7F-\uFFFF]/.test(relevantASCII) && !/\n/.test(lineText)) {
      lineText = relevantASCII;
    }
  }

  // Note: We could technically make this even faster by maintaining two copies
  // of this code, one in Go and one in TypeScript. But I'm not going to do that.
  // The point of this function is to call into the real Go code to get what it
  // does. If someone wants a JS version, they can port it themselves.

  return {
    file: file || "",
    namespace: namespace || "",
    line: line || 0,
    column: column || 0,
    length: length || 0,
    lineText: lineText || "",
    suggestion: suggestion || "",
  };
}

function sanitizeMessages(
  messages: types.PartialMessage[],
  property: string,
  stash: ObjectStash | null,
  fallbackPluginName: string,
  terminalWidth: number | undefined,
): types.Message[] {
  const messagesClone: types.Message[] = [];
  let index = 0;

  for (const message of messages) {
    const keys: OptionKeys = {};
    const id = getFlag(message, keys, "id", mustBeString);
    const pluginName = getFlag(message, keys, "pluginName", mustBeString);
    const text = getFlag(message, keys, "text", mustBeString);
    const location = getFlag(message, keys, "location", mustBeObjectOrNull);
    const notes = getFlag(message, keys, "notes", mustBeArray);
    const detail = getFlag(message, keys, "detail", canBeAnything);
    const where = `in element ${index} of "${property}"`;
    checkForInvalidFlags(message, keys, where);

    const notesClone: types.Note[] = [];
    if (notes) {
      for (const note of notes) {
        const noteKeys: OptionKeys = {};
        const noteText = getFlag(note, noteKeys, "text", mustBeString);
        const noteLocation = getFlag(
          note,
          noteKeys,
          "location",
          mustBeObjectOrNull,
        );
        checkForInvalidFlags(note, noteKeys, where);
        notesClone.push({
          text: noteText || "",
          location: sanitizeLocation(noteLocation, where, terminalWidth),
        });
      }
    }

    messagesClone.push({
      id: id || "",
      pluginName: pluginName || fallbackPluginName,
      text: text || "",
      location: sanitizeLocation(location, where, terminalWidth),
      notes: notesClone,
      detail: stash ? stash.store(detail) : -1,
    });
    index++;
  }

  return messagesClone;
}

function sanitizeStringArray(values: unknown[], property: string): string[] {
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") {
      throw new Error(`${quote(property)} must be an array of strings`);
    }
    result.push(value);
  }
  return result;
}

function sanitizeStringMap(
  map: Record<string, unknown>,
  property: string,
): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  for (const key in map) {
    const value = map[key];
    if (typeof value !== "string") {
      throw new Error(
        `key ${quote(key)} in object ${quote(property)} must be a string`,
      );
    }
    result[key] = value;
  }
  return result;
}

function convertOutputFiles(
  { path, contents, hash }: protocol.BuildOutputFile,
): types.OutputFile {
  // The text is lazily-generated for performance reasons. If no one asks for
  // it, then it never needs to be generated.
  let text: string | null = null;
  return {
    path,
    contents,
    hash,
    get text() {
      // People want to be able to set "contents" and have esbuild automatically
      // derive "text" for them, so grab the contents off of this object instead
      // of using our original value.
      const binary = this.contents;

      // This deliberately doesn't do bidirectional derivation because that could
      // result in the inefficiency. For example, if we did do this and then you
      // set "contents" and "text" and then asked for "contents", the second
      // setter for "text" will have erased our cached "contents" value so we'd
      // need to regenerate it again. Instead, "contents" is unambiguously the
      // primary value and "text" is unambiguously the derived value.
      if (text === null || binary !== contents) {
        contents = binary;
        text = protocol.decodeUTF8(binary);
      }
      return text;
    },
  };
}

function jsRegExpToGoRegExp(regexp: RegExp): string {
  let result = regexp.source;
  if (regexp.flags) result = `(?${regexp.flags})${result}`;
  return result;
}

function parseJSON(bytes: Uint8Array): unknown {
  let text: string;
  try {
    // This may fail in V8 with the error "Cannot create a string longer than
    // 0x1fffffe8 characters". Other JS engines may have similar limitations.
    text = protocol.decodeUTF8(bytes);
  } catch {
    // In that case, we attempt to parse the JSON ourselves directly from the
    // Uint8Array. This bypasses the string length limit as we no longer need
    // to construct a string that's the length of the input. However, doing
    // this is likely significantly slower (perhaps around ~4x slower?), so we
    // only do it if we have to.
    return JSON_parse(bytes);
  }
  return JSON.parse(text);
}
