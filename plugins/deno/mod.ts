/**
 * Main entrypoint for the `@ggpwnkthx/esbuild-plugin-deno` package.
 *
 * This module exports `denoPlugin`, an esbuild plugin that integrates Deno's
 * module resolution, import map semantics, and transpilation pipeline into
 * esbuild builds. It handles imports from `file:`, `http:`, `https:`, `npm:`,
 * and `jsr:` specifiers, applies Deno's configuration and import map, and
 * transpiles TypeScript/JSX before passing content to esbuild.
 *
 * @example
 * ```ts
 * import * as esbuild from "esbuild";
 * import { denoPlugin } from "@ggpwnkthx/esbuild-plugin-deno";
 *
 * await esbuild.build({
 *   entryPoints: ["./main.ts"],
 *   bundle: true,
 *   plugins: [denoPlugin()],
 * });
 * ```
 */
import type * as esbuild from "esbuild";
import * as path from "@std/path";
import { RequestedModuleType, ResolutionMode, Workspace } from "@deno/loader";
import {
  externalToRegex,
  getModuleType,
  getPlatform,
  mediaToLoader,
} from "./utils.ts";

export interface DenoPluginOptions {
  /**
   * Show debugging logs.
   * When `true`, the plugin logs resolution and loading decisions to the console.
   * @default false
   */
  debug?: boolean;
  /**
   * Use this path to a `deno.json` instead of auto-discovering it.
   * If not set, the plugin searches for `deno.json` in the current working directory.
   */
  configPath?: string;
  /**
   * Don't transpile files when loading them.
   * When `true`, source files are passed through as-is without Deno's transpilation step.
   * @default false
   */
  noTranspile?: boolean;
  /**
   * Keep JSX as is, instead of transpiling it according to compilerOptions.
   * Useful when the runtime environment handles JSX natively.
   * @default false
   */
  preserveJsx?: boolean;
  /**
   * Prefix for public environment variables that should be inlined during
   * bundling. Environment variables whose names start with this prefix will
   * have their values embedded at build time via `Deno.env.get()` calls.
   * @example `FRESH_PUBLIC_`
   */
  publicEnvVarPrefix?: string;
}

const SKIP_ASSET_PATTERN =
  /\.(svg|png|jpg|jpeg|gif|webp|ico|avif|apng|tiff|bmp|heic|heif|av1|woff|woff2|ttf|otf|eot|mp3|wav|ogg|flac|aac|m4a|opus|mp4|webm|avi|mov|mkv|flv|wmv|glb|gltf|obj|fbx|usdz|pdf|bin|dat|wasm|sqlite|db|parquet|arrow|css)$/i;

/**
 * Create an esbuild plugin that resolves and loads Deno modules.
 *
 * The plugin handles imports from `file:`, `http:`, `https:`, `npm:`, and `jsr:`
 * specifiers, applying Deno's import map and resolution semantics. It also
 * transpiles TypeScript/JSX and injects prefixed environment variables.
 *
 * @param options - Configuration for the plugin
 * @returns An esbuild plugin to pass to `esbuild.build()`
 *
 * @example
 * ```ts
 * import * as esbuild from "esbuild";
 * import { denoPlugin } from "@deno/esbuild";
 *
 * const ctx = await esbuild.build({
 *   entryPoints: ["./main.ts"],
 *   bundle: true,
 *   plugins: [denoPlugin({ debug: true })],
 * });
 * ```
 */
export function denoPlugin(options: DenoPluginOptions = {}): esbuild.Plugin {
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

      const workspaceRoot = options.configPath
        ? path.resolve(path.dirname(options.configPath))
        : undefined;

      ctx.onDispose(() => {
        loader[Symbol.dispose]?.();
      });

      const externals = (ctx.initialOptions.external ?? []).map((item) =>
        externalToRegex(item)
      );

      const onResolve = async (
        args: esbuild.OnResolveArgs,
      ): Promise<esbuild.OnResolveResult | null> => {
        // Skip asset extensions and CSS - the respective plugins handle those
        if (SKIP_ASSET_PATTERN.test(args.path)) {
          return null;
        }
        if (
          args.path.startsWith("node:") ||
          externals.some((reg) => reg.test(args.path))
        ) {
          return {
            path: args.path,
            external: true,
          };
        }
        const kind =
          args.kind === "require-call" || args.kind === "require-resolve"
            ? ResolutionMode.Require
            : ResolutionMode.Import;

        try {
          const importerUrl = args.importer;

          // If the importer is outside the workspace root, use a synthetic
          // referrer inside the workspace so the import map is applied correctly.
          let effectiveImporter = importerUrl;
          if (!importerUrl && workspaceRoot) {
            // Entry point with no importer — use synthetic referrer so import map applies
            effectiveImporter = path.toFileUrl(
              workspaceRoot + "/.deno-resolver-referrer",
            ).toString();
          } else if (importerUrl && workspaceRoot) {
            // Only substitute local importers that fall outside the workspace.
            // Remote URLs (https://, jsr://, npm://, etc.) must be passed through so
            // the resolver resolves relative imports within the remote package.
            if (
              importerUrl.startsWith("file://") || importerUrl.startsWith("/")
            ) {
              let importerPath: string;
              if (importerUrl.startsWith("file://")) {
                importerPath = path.fromFileUrl(importerUrl);
              } else {
                importerPath = importerUrl;
              }
              if (!importerPath.startsWith(workspaceRoot)) {
                effectiveImporter = path.toFileUrl(
                  workspaceRoot + "/.deno-resolver-referrer",
                ).toString();
              }
            }
            // else: remote URL — keep effectiveImporter as importerUrl unchanged
          }

          const res = await loader.resolve(args.path, effectiveImporter, kind);

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

          const resolved = res.startsWith("file:")
            ? path.fromFileUrl(res)
            : res;

          options.debug && console.debug(
            "[DEBUG onResolve result]",
            JSON.stringify({ path: resolved, namespace }),
          );

          return {
            path: resolved,
            namespace,
          };
        } catch (err) {
          const couldNotResolveReg =
            /not a dependency and not in import map|Relative import path ".*?" not prefixed with/;

          if (
            err instanceof Error && couldNotResolveReg.test(err.message ?? "")
          ) {
            return null;
          }

          throw err;
        }
      };

      // Esbuild doesn't detect namespaces in entrypoints. We need
      // a catchall resolver for that.
      ctx.onResolve({ filter: /.*/ }, onResolve);
      ctx.onResolve({ filter: /.*/, namespace: "file" }, onResolve);
      ctx.onResolve({ filter: /.*/, namespace: "http" }, onResolve);
      ctx.onResolve({ filter: /.*/, namespace: "https" }, onResolve);
      ctx.onResolve({ filter: /.*/, namespace: "data" }, onResolve);
      ctx.onResolve({ filter: /.*/, namespace: "npm" }, onResolve);
      ctx.onResolve({ filter: /.*/, namespace: "jsr" }, onResolve);

      const onLoad = async (
        args: esbuild.OnLoadArgs,
      ): Promise<esbuild.OnLoadResult | null> => {
        // If the path doesn't look like a URL, convert it to a file:// URL
        const url =
          args.path.startsWith("http:") || args.path.startsWith("https:") ||
            args.path.startsWith("npm:") || args.path.startsWith("jsr:")
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
          envPrefix && envPrefix.length > 0 &&
          moduleType === RequestedModuleType.Default
        ) {
          let code = new TextDecoder().decode(res.code);

          code = code.replaceAll(
            /Deno\.env\.get\(["']([^)]+)['"]\)|process\.env\.([\w_-]+)|import\.meta\.env\.([\w_]+)/g,
            (m, name, processName, importMetaName) => {
              if (name !== undefined && name.startsWith(envPrefix)) {
                const val = Deno.env.get(name) ?? null;
                const stringified = JSON.stringify(val);
                // JSON.stringify(null) returns the literal "null" (no quotes).
                // We need a string literal, so wrap in quotes only when the value is null.
                return stringified === "null"
                  ? `"${stringified}"`
                  : stringified;
              }
              if (
                processName !== undefined && processName.startsWith(envPrefix)
              ) {
                const val = Deno.env.get(processName) ?? null;
                const stringified = JSON.stringify(val);
                return stringified === "null"
                  ? `"${stringified}"`
                  : stringified;
              }
              if (
                importMetaName !== undefined &&
                importMetaName.startsWith(envPrefix)
              ) {
                const val = Deno.env.get(importMetaName) ?? null;
                const stringified = JSON.stringify(val);
                return stringified === "null"
                  ? `"${stringified}"`
                  : stringified;
              }
              return m;
            },
          );

          // Handle destructuring pattern: const { MY_VAR } = Deno.env or const { A, B, C } = Deno.env
          code = code.replaceAll(
            /const\s+\{\s*([\w_]+(?:\s*,\s*[\w_]+)*)\s*\}\s*=\s*Deno\.env/g,
            (match: string, identList: string) => {
              const ids = identList.split(",").map((s: string) => s.trim());
              const allMatch = ids.every((id: string) =>
                id.startsWith(envPrefix)
              );
              if (!allMatch) return match;
              const inlined = ids.map((id: string) => {
                const val = Deno.env.get(id) ?? null;
                const stringified = JSON.stringify(val);
                // JSON.stringify(null) returns the literal "null" (no quotes).
                // We need a string literal, so wrap in quotes only when the value is null.
                const literal = stringified === "null"
                  ? `"${stringified}"`
                  : stringified;
                return `${id} = ${literal}`;
              });
              return `const { ${inlined.join(", ")} } = Deno.env`;
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
