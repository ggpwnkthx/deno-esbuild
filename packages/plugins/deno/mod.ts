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
import type * as esbuild from 'esbuild'
import * as esbuildValue from 'esbuild'
import * as path from '@std/path'
import { RequestedModuleType, ResolutionMode, Workspace } from '@deno/loader'
import {
  externalToRegex,
  getModuleType,
  hasUrlScheme,
  mediaToLoader,
  schemeToNamespace,
} from './utils.ts'
import { inlinePublicEnvVars } from './env.ts'
import { buildWorkspaceOptions, type CommonOptions } from './workspace.ts'
import { resolveImporter } from './resolve.ts'

/**
 * Configuration for {@link denoPlugin}.
 */
export interface DenoPluginOptions extends CommonOptions {
  /**
   * Prefix for public environment variables that should be inlined during
   * bundling. Environment variables whose names start with this prefix will
   * have their values embedded at build time via `Deno.env.get()` calls.
   * @example `FRESH_PUBLIC_`
   */
  publicEnvVarPrefix?: string
}

/**
 * The result of resolving a module specifier through Deno's loader.
 * @see DenoPluginHandle.resolve
 */
export interface ResolvedModule {
  /** Fully-qualified URL (`file:`, `http:`, `https:`, `npm:`, `jsr:`, `data:`). */
  url: string
  /** Local filesystem path if `url` is a `file:` URL, otherwise the URL itself. */
  absPath: string
}

/**
 * Options accepted by {@link DenoPluginHandle.build}. All fields are optional;
 * the handle supplies sensible defaults (`format: 'esm'`, `platform: 'browser'`,
 * `target: 'es2022'`, `jsx: 'automatic'`, `jsxImportSource: 'react'`,
 * `sourcemap: 'inline'`).
 */
export interface ModuleBuildOptions {
  format?: 'iife' | 'cjs' | 'esm'
  platform?: 'browser' | 'node' | 'neutral'
  target?: string | string[]
  jsx?: 'transform' | 'preserve' | 'automatic'
  jsxImportSource?: string
  sourcemap?: boolean | 'inline' | 'external' | 'linked' | 'both'
  minify?: boolean
}

/**
 * A long-lived Deno resolver + esbuild plugin. Returned by
 * {@linkcode createDenoPlugin}. Use the `plugin` field with
 * `esbuild.build({ plugins: [handle.plugin] })`, or call `resolve`/`build`
 * directly for fine-grained control (e.g. from a dev server that transforms
 * or bundles on demand).
 *
 * The handle owns a single `Workspace` + `Loader` shared across calls. The
 * caller is responsible for releasing it via {@linkcode DenoPluginHandle.[Symbol.dispose]}.
 */
export interface DenoPluginHandle {
  /** The esbuild plugin, suitable for `plugins: [handle.plugin]`. */
  readonly plugin: esbuild.Plugin
  /**
   * Resolve a specifier the same way Deno would: through the import map,
   * `npm:`, `jsr:`, `http(s):`, and `file:` schemes. `importer` is a `file:`
   * URL, an absolute path, or the workspace's synthetic referrer. Omit it to
   * resolve with the workspace root as referrer.
   */
  resolve(spec: string, importer?: string): Promise<ResolvedModule>
  /**
   * Resolve `entry` through {@linkcode DenoPluginHandle.resolve} and run
   * `esbuild.build({ bundle: true, write: false })` with the Deno plugin
   * wired in. Returns the bundled output as text.
   */
  build(entry: string, opts?: ModuleBuildOptions): Promise<{ code: string }>
  /** Release the underlying workspace loader. Safe to call once. */
  [Symbol.dispose](): void
}

const SKIP_ASSET_PATTERN =
  /\.(svg|png|jpg|jpeg|gif|webp|ico|avif|apng|tiff|bmp|heic|heif|av1|woff|woff2|ttf|otf|eot|mp3|wav|ogg|flac|aac|m4a|opus|mp4|webm|avi|mov|mkv|flv|wmv|glb|gltf|obj|fbx|usdz|pdf|bin|dat|wasm|sqlite|db|parquet|arrow|css)$/i

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
 * import { denoPlugin } from "@ggpwnkthx/esbuild-plugin-deno";
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
    name: 'deno',
    async setup(ctx) {
      const workspaceOptions = buildWorkspaceOptions(options, ctx.initialOptions)
      const workspace = new Workspace(workspaceOptions)

      const loader = await workspace.createLoader()

      const workspaceRoot = options.configPath
        ? path.resolve(path.dirname(options.configPath))
        : undefined

      ctx.onDispose(() => {
        loader[Symbol.dispose]?.()
      })

      const externals = (ctx.initialOptions.external ?? []).map((item) => externalToRegex(item))

      const onResolve = async (
        args: esbuild.OnResolveArgs,
      ): Promise<esbuild.OnResolveResult | null> => {
        // Skip asset extensions and CSS - the respective plugins handle those
        if (SKIP_ASSET_PATTERN.test(args.path)) {
          return null
        }
        if (
          args.path.startsWith('node:') ||
          externals.some((reg) => reg.test(args.path))
        ) {
          return {
            path: args.path,
            external: true,
          }
        }
        const kind = args.kind === 'require-call' || args.kind === 'require-resolve'
          ? ResolutionMode.Require
          : ResolutionMode.Import

        try {
          const effectiveImporter = resolveImporter(args.importer, workspaceRoot)
          const res = await loader.resolve(args.path, effectiveImporter, kind)

          const namespace = schemeToNamespace(res)
          const resolved = res.startsWith('file:') ? path.fromFileUrl(res) : res

          options.debug && console.debug(
            '[DEBUG onResolve result]',
            JSON.stringify({ path: resolved, namespace }),
          )

          return namespace === undefined ? { path: resolved } : { path: resolved, namespace }
        } catch (err) {
          const couldNotResolveReg =
            /not a dependency and not in import map|Relative import path ".*?" not prefixed with/

          if (
            err instanceof Error && couldNotResolveReg.test(err.message ?? '')
          ) {
            return null
          }

          throw err
        }
      }

      // Esbuild doesn't detect namespaces in entrypoints. We need
      // a catchall resolver for that.
      ctx.onResolve({ filter: /.*/ }, onResolve)
      ctx.onResolve({ filter: /.*/, namespace: 'file' }, onResolve)
      ctx.onResolve({ filter: /.*/, namespace: 'http' }, onResolve)
      ctx.onResolve({ filter: /.*/, namespace: 'https' }, onResolve)
      ctx.onResolve({ filter: /.*/, namespace: 'data' }, onResolve)
      ctx.onResolve({ filter: /.*/, namespace: 'npm' }, onResolve)
      ctx.onResolve({ filter: /.*/, namespace: 'jsr' }, onResolve)

      const onLoad = async (
        args: esbuild.OnLoadArgs,
      ): Promise<esbuild.OnLoadResult | null> => {
        // If the path doesn't look like a URL, convert it to a file:// URL
        const url = hasUrlScheme(args.path) ? args.path : path.toFileUrl(args.path).toString()

        const moduleType = getModuleType(args.path, args.with)
        const res = await loader.load(url, moduleType)

        if (res.kind === 'external') {
          return null
        }

        const esbuildLoader = mediaToLoader(res.mediaType)

        // esbuild's onResolve returns null when the importer sits outside the
        // plugin workspace root (see onResolve importer substitution), which
        // would normally leave esbuild with no way to resolve relative paths
        // the file may emit (e.g. require('./util.cjs') inside a CJS entry
        // file loaded from an npm cache directory). Setting resolveDir from
        // the loaded file's directory lets esbuild's default resolver find
        // those siblings when the plugin declines to handle them. Skip the
        // URL-pathed namespaces where path.dirname of an http(s)/npm/jsr URL
        // would be a meaningless base.
        const isUrlArg = hasUrlScheme(args.path)
        const resolveDir = isUrlArg ? undefined : path.dirname(args.path)

        const envPrefix = options.publicEnvVarPrefix
        const shouldInlineEnv = envPrefix && envPrefix.length > 0 &&
          moduleType === RequestedModuleType.Default
        const contents = shouldInlineEnv
          ? inlinePublicEnvVars(new TextDecoder().decode(res.code), envPrefix)
          : res.code

        return {
          contents,
          loader: esbuildLoader,
          ...(resolveDir !== undefined ? { resolveDir } : {}),
        }
      }
      ctx.onLoad({ filter: /.*/, namespace: 'file' }, onLoad)
      ctx.onLoad({ filter: /.*/, namespace: 'jsr' }, onLoad)
      ctx.onLoad({ filter: /.*/, namespace: 'npm' }, onLoad)
      ctx.onLoad({ filter: /.*/, namespace: 'http' }, onLoad)
      ctx.onLoad({ filter: /.*/, namespace: 'https' }, onLoad)
      ctx.onLoad({ filter: /.*/, namespace: 'data' }, onLoad)
    },
  }
}

/**
 * Build a long-lived Deno resolver + esbuild plugin as a single handle. The
 * returned handle exposes the esbuild `plugin` (for use with
 * `esbuild.build({ plugins: [handle.plugin] })`) plus `resolve()` and
 * `build()` helpers that route through the same shared `Workspace` + `Loader`
 * instance.
 *
 * This is the recommended entry point for runtime dev-server scenarios where
 * many small esbuild calls share one workspace (e.g. per-file transforms
 * driven by HTTP requests). For one-shot builds prefer {@linkcode denoPlugin}.
 *
 * The handle does NOT auto-dispose its loader; call `handle[Symbol.dispose]()`
 * (or use `using`) when the server shuts down.
 *
 * @param options - Plugin/workspace configuration.
 * @returns A handle exposing the plugin plus resolve/build helpers.
 *
 * @example
 * ```ts
 * import * as esbuild from "esbuild";
 * import { createDenoPlugin } from "@ggpwnkthx/esbuild-plugin-deno";
 *
 * const handle = await createDenoPlugin({ configPath: "./deno.json" });
 * try {
 *   const { code } = await handle.build("./src/main.tsx", {
 *     sourcemap: "inline",
 *   });
 * } finally {
 *   handle[Symbol.dispose]();
 * }
 * ```
 */
export async function createDenoPlugin(
  options: DenoPluginOptions = {},
): Promise<DenoPluginHandle> {
  const workspaceOptions = buildWorkspaceOptions(options, {})
  const workspace = new Workspace(workspaceOptions)
  const loader = await workspace.createLoader()

  const workspaceRoot = options.configPath
    ? path.resolve(path.dirname(options.configPath))
    : undefined

  const plugin: esbuild.Plugin = {
    name: 'deno',
    setup(ctx) {
      // The handle owns the loader lifetime; nothing to do on esbuild dispose.
      onRegisterHandlers(ctx, loader, workspaceRoot, options)
    },
  }

  let disposed = false
  const handle: DenoPluginHandle = {
    plugin,
    async resolve(spec: string, importer?: string): Promise<ResolvedModule> {
      const effectiveImporter = resolveImporter(importer, workspaceRoot)
      const url = await loader.resolve(spec, effectiveImporter, ResolutionMode.Import)
      const absPath = url.startsWith('file:') ? path.fromFileUrl(url) : url
      return { url, absPath }
    },
    async build(entry: string, opts: ModuleBuildOptions = {}): Promise<{ code: string }> {
      const { absPath } = await handle.resolve(entry)
      const result = await esbuildValue.build({
        entryPoints: [absPath],
        bundle: true,
        write: false,
        format: opts.format ?? 'esm',
        platform: opts.platform ?? 'browser',
        target: opts.target ?? 'es2022',
        jsx: opts.jsx ?? 'automatic',
        jsxImportSource: opts.jsxImportSource ?? 'react',
        sourcemap: opts.sourcemap ?? 'inline',
        minify: opts.minify ?? false,
        plugins: [plugin],
      })
      const code = result.outputFiles?.[0]?.text ?? ''
      return { code }
    },
    [Symbol.dispose]() {
      if (disposed) return
      disposed = true
      loader[Symbol.dispose]?.()
    },
  }

  return handle
}

/**
 * Wire the same loader the plugin handle owns into an esbuild plugin
 * `setup` context. Shared between {@linkcode denoPlugin} (which manages the
 * loader internally and disposes it via `ctx.onDispose`) and
 * {@linkcode createDenoPlugin} (which manages the loader via the handle).
 */
function onRegisterHandlers(
  ctx: esbuild.PluginBuild,
  loader: Awaited<ReturnType<Workspace['createLoader']>>,
  workspaceRoot: string | undefined,
  options: DenoPluginOptions,
): void {
  // The loader is captured in closure; its work happens lazily inside the
  // onResolve/onLoad callbacks below.
  void loader
  const externals = (ctx.initialOptions.external ?? []).map((item) => externalToRegex(item))

  const onResolve = async (
    args: esbuild.OnResolveArgs,
  ): Promise<esbuild.OnResolveResult | null> => {
    if (SKIP_ASSET_PATTERN.test(args.path)) return null
    if (args.path.startsWith('node:') || externals.some((reg) => reg.test(args.path))) {
      return { path: args.path, external: true }
    }
    const kind = args.kind === 'require-call' || args.kind === 'require-resolve'
      ? ResolutionMode.Require
      : ResolutionMode.Import

    try {
      const effectiveImporter = resolveImporter(args.importer, workspaceRoot)
      const res = await loader.resolve(args.path, effectiveImporter, kind)

      const namespace = schemeToNamespace(res)
      const resolved = res.startsWith('file:') ? path.fromFileUrl(res) : res

      options.debug && console.debug(
        '[DEBUG onResolve result]',
        JSON.stringify({ path: resolved, namespace }),
      )

      return namespace === undefined ? { path: resolved } : { path: resolved, namespace }
    } catch (err) {
      const couldNotResolveReg =
        /not a dependency and not in import map|Relative import path ".*?" not prefixed with/
      if (err instanceof Error && couldNotResolveReg.test(err.message ?? '')) {
        return null
      }
      throw err
    }
  }

  ctx.onResolve({ filter: /.*/ }, onResolve)
  ctx.onResolve({ filter: /.*/, namespace: 'file' }, onResolve)
  ctx.onResolve({ filter: /.*/, namespace: 'http' }, onResolve)
  ctx.onResolve({ filter: /.*/, namespace: 'https' }, onResolve)
  ctx.onResolve({ filter: /.*/, namespace: 'data' }, onResolve)
  ctx.onResolve({ filter: /.*/, namespace: 'npm' }, onResolve)
  ctx.onResolve({ filter: /.*/, namespace: 'jsr' }, onResolve)

  const onLoad = async (
    args: esbuild.OnLoadArgs,
  ): Promise<esbuild.OnLoadResult | null> => {
    const url = hasUrlScheme(args.path) ? args.path : path.toFileUrl(args.path).toString()

    const moduleType = getModuleType(args.path, args.with)
    const res = await loader.load(url, moduleType)

    if (res.kind === 'external') return null

    const esbuildLoader = mediaToLoader(res.mediaType)

    const isUrlArg = hasUrlScheme(args.path)
    const resolveDir = isUrlArg ? undefined : path.dirname(args.path)

    const envPrefix = options.publicEnvVarPrefix
    const shouldInlineEnv = envPrefix && envPrefix.length > 0 &&
      moduleType === RequestedModuleType.Default
    const contents = shouldInlineEnv
      ? inlinePublicEnvVars(new TextDecoder().decode(res.code), envPrefix)
      : res.code

    return {
      contents,
      loader: esbuildLoader,
      ...(resolveDir !== undefined ? { resolveDir } : {}),
    }
  }
  ctx.onLoad({ filter: /.*/, namespace: 'file' }, onLoad)
  ctx.onLoad({ filter: /.*/, namespace: 'jsr' }, onLoad)
  ctx.onLoad({ filter: /.*/, namespace: 'npm' }, onLoad)
  ctx.onLoad({ filter: /.*/, namespace: 'http' }, onLoad)
  ctx.onLoad({ filter: /.*/, namespace: 'https' }, onLoad)
  ctx.onLoad({ filter: /.*/, namespace: 'data' }, onLoad)
}
