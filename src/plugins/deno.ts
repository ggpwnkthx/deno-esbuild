/**
 * Deno esbuild plugin
 *
 * This plugin adds support for Deno-style resolution and loading of code.
 * It supports the following specifiers:
 * - `file:`
 * - `data:`
 * - `npm:`
 * - `jsr:`
 * - `http:` + `https:`
 *
 * @example
 * ```typescript
 * import { build, denoPlugin } from "@ggpwnkthx/esbuild";
 *
 * await build({
 *   entryPoints: ["app.ts"],
 *   bundle: true,
 *   plugins: [denoPlugin()],
 * });
 * ```
 *
 * @module
 */

import {
  MediaType,
  RequestedModuleType,
  ResolutionMode,
  Workspace,
  type WorkspaceOptions,
} from "@deno/loader";
import type {
  ImportKind,
  Loader,
  OnLoadArgs,
  OnLoadResult,
  OnResolveArgs,
  OnResolveResult,
  Platform,
  Plugin,
} from "../types.ts";
import * as path from "jsr:@std/path@^1";
import { isBuiltin } from "node:module";

export interface DenoPluginOptions {
  debug?: boolean;
  configPath?: string;
  noTranspile?: boolean;
  preserveJsx?: boolean;
  publicEnvVarPrefix?: string;
}

function getImportKind(kind: ImportKind): ResolutionMode {
  switch (kind) {
    case "require-call":
    case "require-resolve":
      return ResolutionMode.Require;
    default:
      return ResolutionMode.Import;
  }
}

function getPlatform(platform: Platform | undefined): WorkspaceOptions["platform"] {
  switch (platform) {
    case "browser":
      return "browser";
    case "node":
      return "node";
    case "neutral":
    default:
      return undefined;
  }
}

function getModuleType(
  file: string,
  withArgs: Record<string, string>,
): RequestedModuleType {
  switch (withArgs.type) {
    case "text":
      return RequestedModuleType.Text;
    case "bytes":
      return RequestedModuleType.Bytes;
    case "json":
      return RequestedModuleType.Json;
    default:
      if (file.endsWith(".json")) {
        return RequestedModuleType.Json;
      }
      return RequestedModuleType.Default;
  }
}

function mediaToLoader(type: MediaType): Loader {
  switch (type) {
    case MediaType.Jsx:
      return "jsx";
    case MediaType.JavaScript:
    case MediaType.Mjs:
    case MediaType.Cjs:
      return "js";
    case MediaType.TypeScript:
    case MediaType.Mts:
    case MediaType.Dmts:
    case MediaType.Dcts:
      return "ts";
    case MediaType.Tsx:
      return "tsx";
    case MediaType.Css:
      return "css";
    case MediaType.Json:
      return "json";
    case MediaType.Html:
      return "default";
    case MediaType.Sql:
      return "default";
    case MediaType.Wasm:
      return "binary";
    case MediaType.SourceMap:
      return "json";
    case MediaType.Unknown:
      return "default";
    default:
      return "default";
  }
}

function externalToRegex(external: string): RegExp {
  return new RegExp(
    "^" + external.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&").replace(
      /\*/g,
      ".*",
    ) + "$",
  );
}

export function denoPlugin(options: DenoPluginOptions = {}): Plugin {
  return {
    name: "deno",
    async setup(ctx) {
      const workspace = new Workspace({
        debug: options.debug,
        configPath: options.configPath,
        nodeConditions: ctx.initialOptions.conditions,
        noTranspile: options.noTranspile,
        preserveJsx: options.preserveJsx,
        platform: getPlatform(ctx.initialOptions.platform),
      });

      const loader = await workspace.createLoader();

      ctx.onDispose(() => {
        loader[Symbol.dispose]?.();
      });

      const externals = (ctx.initialOptions.external ?? []).map((item) =>
        externalToRegex(item)
      );

      const onResolve = async (
        args: OnResolveArgs,
      ): Promise<OnResolveResult | null> => {
        if (
          isBuiltin(args.path) || externals.some((reg) => reg.test(args.path))
        ) {
          return {
            path: args.path,
            external: true,
          };
        }

        try {
          const res = await loader.resolve(
            args.path,
            args.importer,
            getImportKind(args.kind),
          );

          let namespace: string | undefined;
          if (res.startsWith("file:")) {
            namespace = "file";
          } else if (res.startsWith("http:")) {
            namespace = "http";
          } else if (res.startsWith("https:")) {
            namespace = "https";
          } else if (res.startsWith("npm:")) {
            namespace = "npm";
          } else if (res.startsWith("jsr:")) {
            namespace = "jsr";
          }

          const resolved = res.startsWith("file:") ? path.fromFileUrl(res) : res;

          return {
            path: resolved,
            namespace,
          };
        } catch (err) {
          const couldNotResolveReg =
            /not a dependency and not in import map|Relative import path ".*?" not prefixed with/;

          if (err instanceof Error && couldNotResolveReg.test(err.message)) {
            return null;
          }

          throw err;
        }
      };

      ctx.onResolve({ filter: /.*/ }, onResolve);
      ctx.onResolve({ filter: /.*/, namespace: "file" }, onResolve);
      ctx.onResolve({ filter: /.*/, namespace: "http" }, onResolve);
      ctx.onResolve({ filter: /.*/, namespace: "https" }, onResolve);
      ctx.onResolve({ filter: /.*/, namespace: "data" }, onResolve);
      ctx.onResolve({ filter: /.*/, namespace: "npm" }, onResolve);
      ctx.onResolve({ filter: /.*/, namespace: "jsr" }, onResolve);

      const onLoad = async (
        args: OnLoadArgs,
      ): Promise<OnLoadResult | null> => {
        const url = args.path.startsWith("http:") || args.path.startsWith("https:")
          || args.path.startsWith("npm:") || args.path.startsWith("jsr:")
          ? args.path
          : path.toFileUrl(args.path).toString();

        const moduleType = getModuleType(args.path, args.with);
        const res = await loader.load(url, moduleType);

        if (res.kind === "external") {
          return null;
        }

        const esbuildLoader = mediaToLoader(res.mediaType);

        const envPrefix = options.publicEnvVarPrefix;
        if (
          envPrefix
          && moduleType === RequestedModuleType.Default
        ) {
          let code = new TextDecoder().decode(res.code);

          code = code.replaceAll(
            /Deno\.env\.get\(["']([^)]+)['"]\)|process\.env\.([\w_-]+)/g,
            (m, name, processName) => {
              if (name !== undefined && name.startsWith(envPrefix)) {
                return JSON.stringify(Deno.env.get(name));
              }
              if (
                processName !== undefined && processName.startsWith(envPrefix)
              ) {
                return JSON.stringify(Deno.env.get(processName));
              }
              return m;
            },
          );

          return {
            contents: code,
            loader: esbuildLoader,
          };
        }

        return {
          contents: res.code,
          loader: esbuildLoader,
        };
      };
      ctx.onLoad({ filter: /.*/, namespace: "file" }, onLoad);
      ctx.onLoad({ filter: /.*/, namespace: "jsr" }, onLoad);
      ctx.onLoad({ filter: /.*/, namespace: "npm" }, onLoad);
      ctx.onLoad({ filter: /.*/, namespace: "http" }, onLoad);
      ctx.onLoad({ filter: /.*/, namespace: "https" }, onLoad);
      ctx.onLoad({ filter: /.*/, namespace: "data" }, onLoad);
    },
  };
}
