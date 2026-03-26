import {
  checkForInvalidFlags,
  getFlag,
  jsRegExpToGoRegExp,
  mustBeArrayOfStrings,
  mustBeBoolean,
  mustBeEntryPoints,
  mustBeInteger,
  mustBeObject,
  mustBeRegExp,
  mustBeString,
  mustBeStringOrArrayOfStrings,
  mustBeStringOrBoolean,
  mustBeStringOrObject,
  mustBeStringOrUint8Array,
  validateAndJoinStringArray,
  validateMangleCache,
  validateStringValue,
} from "./validation.ts";
import { encodeUTF8 } from "./codec.ts";

const buildLogLevelDefault = "warning";
const transformLogLevelDefault = "silent";

export function pushLogFlags(
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

export function pushCommonFlags(
  flags: string[],
  options: Record<string, unknown>,
  keys: Record<string, boolean>,
): void {
  const legalComments = getFlag<string>(options, keys, "legalComments", mustBeString);
  const sourceRoot = getFlag<string>(options, keys, "sourceRoot", mustBeString);
  const sourcesContent = getFlag<boolean>(
    options,
    keys,
    "sourcesContent",
    mustBeBoolean,
  );
  const target = getFlag<string | string[]>(
    options,
    keys,
    "target",
    mustBeStringOrArrayOfStrings,
  );
  const format = getFlag<string>(options, keys, "format", mustBeString);
  const globalName = getFlag<string>(options, keys, "globalName", mustBeString);
  const mangleProps = getFlag<RegExp>(options, keys, "mangleProps", mustBeRegExp);
  const reserveProps = getFlag<RegExp>(options, keys, "reserveProps", mustBeRegExp);
  const mangleQuoted = getFlag<boolean>(options, keys, "mangleQuoted", mustBeBoolean);
  const minify = getFlag<boolean>(options, keys, "minify", mustBeBoolean);
  const minifySyntax = getFlag<boolean>(
    options,
    keys,
    "minifySyntax",
    mustBeBoolean,
  );
  const minifyWhitespace = getFlag<boolean>(
    options,
    keys,
    "minifyWhitespace",
    mustBeBoolean,
  );
  const minifyIdentifiers = getFlag<boolean>(
    options,
    keys,
    "minifyIdentifiers",
    mustBeBoolean,
  );
  const lineLimit = getFlag<number>(options, keys, "lineLimit", mustBeInteger);
  const drop = getFlag<string[]>(options, keys, "drop", mustBeArrayOfStrings);
  const dropLabels = getFlag<string[]>(
    options,
    keys,
    "dropLabels",
    mustBeArrayOfStrings,
  );
  const charset = getFlag<string>(options, keys, "charset", mustBeString);
  const treeShaking = getFlag<boolean>(
    options,
    keys,
    "treeShaking",
    mustBeBoolean,
  );
  const ignoreAnnotations = getFlag<boolean>(
    options,
    keys,
    "ignoreAnnotations",
    mustBeBoolean,
  );
  const jsx = getFlag<string>(options, keys, "jsx", mustBeString);
  const jsxFactory = getFlag<string>(options, keys, "jsxFactory", mustBeString);
  const jsxFragment = getFlag<string>(options, keys, "jsxFragment", mustBeString);
  const jsxImportSource = getFlag<string>(
    options,
    keys,
    "jsxImportSource",
    mustBeString,
  );
  const jsxDev = getFlag<boolean>(options, keys, "jsxDev", mustBeBoolean);
  const jsxSideEffects = getFlag<boolean>(
    options,
    keys,
    "jsxSideEffects",
    mustBeBoolean,
  );
  const define = getFlag<Record<string, string>>(options, keys, "define", mustBeObject);
  const logOverride = getFlag<Record<string, string>>(
    options,
    keys,
    "logOverride",
    mustBeObject,
  );
  const supported = getFlag<Record<string, boolean>>(
    options,
    keys,
    "supported",
    mustBeObject,
  );
  const pure = getFlag<string[]>(options, keys, "pure", mustBeArrayOfStrings);
  const keepNames = getFlag<boolean>(options, keys, "keepNames", mustBeBoolean);
  const platform = getFlag<string>(options, keys, "platform", mustBeString);
  const tsconfigRaw = getFlag<string | Record<string, unknown>>(
    options,
    keys,
    "tsconfigRaw",
    mustBeStringOrObject,
  );
  const absPaths = getFlag<string[]>(options, keys, "absPaths", mustBeArrayOfStrings);

  if (legalComments) flags.push(`--legal-comments=${legalComments}`);
  if (sourceRoot !== void 0) flags.push(`--source-root=${sourceRoot}`);
  if (sourcesContent !== void 0) flags.push(`--sources-content=${sourcesContent}`);
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
        typeof tsconfigRaw === "string" ? tsconfigRaw : JSON.stringify(tsconfigRaw)
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
  if (ignoreAnnotations) flags.push("--ignore-annotations");
  if (drop) {
    for (const what of drop) flags.push(`--drop:${validateStringValue(what, "drop")}`);
  }
  if (dropLabels) {
    flags.push(`--drop-labels=${validateAndJoinStringArray(dropLabels, "drop label")}`);
  }
  if (absPaths) {
    flags.push(`--abs-paths=${validateAndJoinStringArray(absPaths, "abs paths")}`);
  }
  if (mangleProps) flags.push(`--mangle-props=${jsRegExpToGoRegExp(mangleProps)}`);
  if (reserveProps) {
    flags.push(`--reserve-props=${jsRegExpToGoRegExp(reserveProps)}`);
  }
  if (mangleQuoted !== void 0) flags.push(`--mangle-quoted=${mangleQuoted}`);
  if (jsx) flags.push(`--jsx=${jsx}`);
  if (jsxFactory) flags.push(`--jsx-factory=${jsxFactory}`);
  if (jsxFragment) flags.push(`--jsx-fragment=${jsxFragment}`);
  if (jsxImportSource) flags.push(`--jsx-import-source=${jsxImportSource}`);
  if (jsxDev) flags.push("--jsx-dev");
  if (jsxSideEffects) flags.push("--jsx-side-effects");
  if (define) {
    for (const key in define) {
      if (key.indexOf("=") >= 0) throw new Error(`Invalid define: ${key}`);
      flags.push(`--define:${key}=${validateStringValue(define[key], "define", key)}`);
    }
  }
  if (logOverride) {
    for (const key in logOverride) {
      if (key.indexOf("=") >= 0) throw new Error(`Invalid log override: ${key}`);
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
    for (const fn of pure) flags.push(`--pure:${validateStringValue(fn, "pure")}`);
  }
  if (keepNames) flags.push("--keep-names");
}

const quote = JSON.stringify;

interface FlagsForBuildOptionsResult {
  entries: [string, string][];
  flags: string[];
  write: boolean | undefined;
  stdinContents: Uint8Array | null;
  stdinResolveDir: string | null;
  absWorkingDir: string | undefined;
  nodePaths: string[];
  mangleCache: Record<string, string | false> | undefined;
}

export function flagsForBuildOptions(
  callName: string,
  options: Record<string, unknown> | undefined,
  isTTY: boolean,
  logLevelDefault: string,
  writeDefault: boolean,
): FlagsForBuildOptionsResult {
  const flags: string[] = [];
  const entries: [string, string][] = [];
  const keys: Record<string, boolean> = Object.create(null);
  let stdinContents: Uint8Array | null = null;
  let stdinResolveDir: string | null = null;

  pushLogFlags(flags, options ?? {}, keys, isTTY, logLevelDefault);
  pushCommonFlags(flags, options ?? {}, keys);

  const sourcemap = getFlag<boolean | string>(
    options ?? {},
    keys,
    "sourcemap",
    mustBeStringOrBoolean,
  );
  const bundle = getFlag<boolean>(options ?? {}, keys, "bundle", mustBeBoolean);
  const splitting = getFlag<boolean>(options ?? {}, keys, "splitting", mustBeBoolean);
  const preserveSymlinks = getFlag<boolean>(
    options ?? {},
    keys,
    "preserveSymlinks",
    mustBeBoolean,
  );
  const metafile = getFlag<boolean>(options ?? {}, keys, "metafile", mustBeBoolean);
  const outfile = getFlag<string>(options ?? {}, keys, "outfile", mustBeString);
  const outdir = getFlag<string>(options ?? {}, keys, "outdir", mustBeString);
  const outbase = getFlag<string>(options ?? {}, keys, "outbase", mustBeString);
  const tsconfig = getFlag<string>(options ?? {}, keys, "tsconfig", mustBeString);
  const resolveExtensions = getFlag<string[]>(
    options ?? {},
    keys,
    "resolveExtensions",
    mustBeArrayOfStrings,
  );
  const nodePathsInput = getFlag<string[]>(
    options ?? {},
    keys,
    "nodePaths",
    mustBeArrayOfStrings,
  );
  const mainFields = getFlag<string[]>(
    options ?? {},
    keys,
    "mainFields",
    mustBeArrayOfStrings,
  );
  const conditions = getFlag<string[]>(
    options ?? {},
    keys,
    "conditions",
    mustBeArrayOfStrings,
  );
  const external = getFlag<string[]>(
    options ?? {},
    keys,
    "external",
    mustBeArrayOfStrings,
  );
  const packages = getFlag<string>(options ?? {}, keys, "packages", mustBeString);
  const alias = getFlag<Record<string, string>>(
    options ?? {},
    keys,
    "alias",
    mustBeObject,
  );
  const loader = getFlag<Record<string, string>>(
    options ?? {},
    keys,
    "loader",
    mustBeObject,
  );
  const outExtension = getFlag<Record<string, string>>(
    options ?? {},
    keys,
    "outExtension",
    mustBeObject,
  );
  const publicPath = getFlag<string>(options ?? {}, keys, "publicPath", mustBeString);
  const entryNames = getFlag<string>(options ?? {}, keys, "entryNames", mustBeString);
  const chunkNames = getFlag<string>(options ?? {}, keys, "chunkNames", mustBeString);
  const assetNames = getFlag<string>(options ?? {}, keys, "assetNames", mustBeString);
  const inject = getFlag<string[]>(options ?? {}, keys, "inject", mustBeArrayOfStrings);
  const banner = getFlag<Record<string, string>>(
    options ?? {},
    keys,
    "banner",
    mustBeObject,
  );
  const footer = getFlag<Record<string, string>>(
    options ?? {},
    keys,
    "footer",
    mustBeObject,
  );
  const entryPoints = getFlag<unknown>(
    options ?? {},
    keys,
    "entryPoints",
    mustBeEntryPoints,
  );
  const absWorkingDir = getFlag<string>(
    options ?? {},
    keys,
    "absWorkingDir",
    mustBeString,
  );
  const stdin = getFlag<Record<string, unknown>>(
    options ?? {},
    keys,
    "stdin",
    mustBeObject,
  );
  const write = getFlag<boolean>(options ?? {}, keys, "write", mustBeBoolean)
    ?? writeDefault;
  const allowOverwrite = getFlag<boolean>(
    options ?? {},
    keys,
    "allowOverwrite",
    mustBeBoolean,
  );
  const mangleCache = getFlag<Record<string, string | false>>(
    options ?? {},
    keys,
    "mangleCache",
    mustBeObject,
  );
  keys.plugins = true;
  checkForInvalidFlags(options ?? {}, keys, `in ${callName}() call`);

  if (sourcemap) {
    flags.push(`--sourcemap${sourcemap === true ? "" : `=${sourcemap}`}`);
  }
  if (bundle) flags.push("--bundle");
  if (allowOverwrite) flags.push("--allow-overwrite");
  if (splitting) flags.push("--splitting");
  if (preserveSymlinks) flags.push("--preserve-symlinks");
  if (metafile) flags.push("--metafile");
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
    flags.push(`--conditions=${validateAndJoinStringArray(conditions, "condition")}`);
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
      flags.push(`--loader:${ext}=${validateStringValue(loader[ext], "loader", ext)}`);
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
          const entryPointKeys: Record<string, boolean> = Object.create(null);
          const input = getFlag<string>(
            entryPoint as Record<string, unknown>,
            entryPointKeys,
            "in",
            mustBeString,
          );
          const output = getFlag<string>(
            entryPoint as Record<string, unknown>,
            entryPointKeys,
            "out",
            mustBeString,
          );
          checkForInvalidFlags(
            entryPoint as Record<string, unknown>,
            entryPointKeys,
            "in entry point at index " + i,
          );
          if (input === void 0) {
            throw new Error('Missing property "in" for entry point at index ' + i);
          }
          if (output === void 0) {
            throw new Error('Missing property "out" for entry point at index ' + i);
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
          validateStringValue(
            (entryPoints as Record<string, string>)[key],
            "entry point",
            key,
          ),
        ]);
      }
    }
  }
  if (stdin) {
    const stdinKeys: Record<string, boolean> = Object.create(null);
    const contents = getFlag<string | Uint8Array>(
      stdin,
      stdinKeys,
      "contents",
      mustBeStringOrUint8Array,
    );
    const resolveDir = getFlag<string>(stdin, stdinKeys, "resolveDir", mustBeString);
    const sourcefile = getFlag<string>(stdin, stdinKeys, "sourcefile", mustBeString);
    const loader2 = getFlag<string>(stdin, stdinKeys, "loader", mustBeString);
    checkForInvalidFlags(stdin, stdinKeys, 'in "stdin" object');
    if (sourcefile) flags.push(`--sourcefile=${sourcefile}`);
    if (loader2) flags.push(`--loader=${loader2}`);
    if (resolveDir) stdinResolveDir = resolveDir;
    if (typeof contents === "string") stdinContents = encodeUTF8(contents);
    else if (contents instanceof Uint8Array) stdinContents = contents;
  }

  const nodePaths: string[] = [];
  if (nodePathsInput) {
    for (const value of nodePathsInput) {
      nodePaths.push(value + "");
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

export function flagsForTransformOptions(
  callName: string,
  options: Record<string, unknown> | undefined,
  isTTY: boolean,
  logLevelDefault: string,
): { flags: string[]; mangleCache: Record<string, string | false> | undefined } {
  const flags: string[] = [];
  const keys: Record<string, boolean> = Object.create(null);

  pushLogFlags(flags, options ?? {}, keys, isTTY, logLevelDefault);
  pushCommonFlags(flags, options ?? {}, keys);

  const sourcemap = getFlag<boolean | string>(
    options ?? {},
    keys,
    "sourcemap",
    mustBeStringOrBoolean,
  );
  const sourcefile = getFlag<string>(options ?? {}, keys, "sourcefile", mustBeString);
  const loader = getFlag<string>(options ?? {}, keys, "loader", mustBeString);
  const banner = getFlag<string>(options ?? {}, keys, "banner", mustBeString);
  const footer = getFlag<string>(options ?? {}, keys, "footer", mustBeString);
  const mangleCache = getFlag<Record<string, string | false>>(
    options ?? {},
    keys,
    "mangleCache",
    mustBeObject,
  );

  checkForInvalidFlags(options ?? {}, keys, `in ${callName}() call`);

  if (sourcemap) {
    flags.push(
      `--sourcemap=${sourcemap === true ? "external" : sourcemap}`,
    );
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

export { buildLogLevelDefault, transformLogLevelDefault };
