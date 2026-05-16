/**
 * Main entrypoint for the `@ggpwnkthx/esbuild-plugin-css` package.
 *
 * This module provides `cssPlugin`, an esbuild plugin that resolves and inlines
 * CSS `@import` rules during bundles. It handles both local relative imports and
 * external URL imports (marked as external).
 *
 * @example
 * ```ts
 * import * as esbuild from "esbuild";
 * import { cssPlugin } from "@ggpwnkthx/esbuild-plugin-css";
 *
 * await esbuild.build({
 *   entryPoints: ["src/index.ts"],
 *   bundle: true,
 *   outfile: "dist/bundle.js",
 *   plugins: [cssPlugin()],
 * });
 * ```
 */
import type * as esbuild from "esbuild";
import * as path from "@std/path";

export interface CssPluginOptions {
  /** When true, emit the fully-resolved CSS as a separate output file.
   *  The CSS must be added as an entry point (not just imported from JS).
   *  When used with `bundle: true`, esbuild will emit a bundled .css file
   *  instead of inlining the CSS into the JS bundle. */
  emitFile?: boolean;
}

/**
 * Information about a CSS entry point's output naming.
 */
interface EntryPointOutputName {
  outputName: string; // e.g. "routes/index" from entryPoints
  virtualCssCounter: number; // counter for multiple CSS imports
}

/**
 * Information about a non-entry CSS file imported from a non-CSS entry point.
 * These need to be extracted and injected into outputFiles by onEnd.
 */
interface TrackedCssEntry {
  originalPath: string; // path used in virtual entry (for output naming)
  resolveDir: string; // directory for resolving relative @imports
  bundledCss: string; // fully resolved CSS content
}

/**
 * Minimal OutputFile interface for injecting virtual CSS files.
 * This matches the structure esbuild expects in outputFiles.
 */
interface VirtualOutputFile {
  path: string;
  contents: Uint8Array;
  hash: string;
  text: string;
}

/**
 * esbuild plugin that loads CSS files and resolves `@import` rules.
 * @param options - Plugin options.
 * @returns An esbuild plugin that resolves local `@import` paths and inlines them.
 */
export function cssPlugin(options: CssPluginOptions = {}): esbuild.Plugin {
  const {
    emitFile = false,
  } = options;

  // When emitFile is enabled, track CSS entry points: resolved path -> original path
  const cssEntryPoints = emitFile ? new Map<string, string>() : null;

  // Track output names for entry points (used for naming virtual CSS files)
  const entryPointOutputNames: Map<string, EntryPointOutputName> | null =
    emitFile ? new Map() : null;

  // Track non-entry CSS imports (CSS imported from non-CSS entry points like TSX)
  const nonEntryCssImports: Map<string, TrackedCssEntry> | null = emitFile
    ? new Map()
    : null;

  return {
    name: "css",

    setup(ctx) {
      // Compute output names for entry points when emitFile is enabled
      ctx.onStart(() => {
        if (!emitFile) return;

        const entryPoints = ctx.initialOptions.entryPoints;
        if (!entryPoints) return;

        const entryPointArray: Array<[string, string]> =
          Array.isArray(entryPoints)
            ? entryPoints.map((ep) =>
              Array.isArray(ep) ? [ep[0], ep[1]] : [ep, ep]
            )
            : Object.entries(entryPoints);

        for (const [input, output] of entryPointArray) {
          const outputName = output
            ? output.replace(/\.[^.]+$/, "") // "dist/index" from "dist/index.js"
            : input.replace(/\.[^.]+$/, ""); // "index" from "index.tsx"
          entryPointOutputNames!.set(input, {
            outputName,
            virtualCssCounter: 0,
          });
        }
      });

      // Intercept CSS imports to resolve relative paths and track non-entry CSS
      ctx.onResolve(
        { filter: /\.css$/ },
        (args): esbuild.OnResolveResult | null => {
          // When emitFile is enabled, also intercept CSS entry points
          if (emitFile && args.kind === "entry-point") {
            const resolvedPath = path.resolve(args.path);
            cssEntryPoints!.set(resolvedPath, args.path);
            return { path: resolvedPath };
          }

          // External URL imports — mark as external
          if (
            args.kind === "import-rule" &&
            (args.path.startsWith("https://") ||
              args.path.startsWith("http://"))
          ) {
            return {
              path: args.path,
              external: true,
            };
          }

          // Local relative imports — resolve to absolute path
          const resolvedPath = path.resolve(
            path.dirname(args.importer),
            args.path,
          );

          // When emitFile is enabled, track non-entry CSS imports
          // (CSS imported from non-CSS entry points like TSX/TS/JS)
          if (emitFile) {
            // Check if this CSS is tracked as a CSS entry point
            const isEntryPoint = cssEntryPoints!.has(resolvedPath);

            if (!isEntryPoint) {
              // Check if the importer is a JS/TSX entry point
              const importerExt = path.extname(args.importer);
              const isJsEntry = [".ts", ".tsx", ".js", ".jsx"].includes(
                importerExt,
              );

              // Check if importer is a CSS entry point
              const cssEpPath = Array.from(cssEntryPoints!.keys()).find(
                (ep) =>
                  path.resolve(ep) === args.importer ||
                  path.resolve(ep).endsWith(args.importer),
              );

              // Find the nearest ancestor entry point for this importer
              const findAncestorEntryPoint = (
                importer: string,
              ): string | undefined => {
                const normalizedImporter = path.resolve(importer);
                let bestMatch: string | undefined;

                for (const ep of entryPointOutputNames!.keys()) {
                  const normalizedEp = path.resolve(ep);
                  // Check if the entry point is an ancestor of the importer
                  // The entry point's directory must be a prefix of the importer's path
                  const epDir = path.dirname(normalizedEp) + "/";
                  if (
                    normalizedImporter.startsWith(epDir) ||
                    normalizedImporter === normalizedEp
                  ) {
                    // Prefer the longest match (most specific entry point)
                    if (
                      !bestMatch ||
                      normalizedEp.length > path.resolve(bestMatch).length
                    ) {
                      bestMatch = ep;
                    }
                  }
                }
                return bestMatch;
              };

              const entryPointInputPath = isJsEntry
                ? findAncestorEntryPoint(args.importer) ?? args.importer
                : cssEpPath ?? args.importer;

              // Look up the entry point info to derive a virtual output name
              const entryInfo = entryPointInputPath
                ? entryPointOutputNames!.get(entryPointInputPath)
                : null;

              if (entryInfo) {
                // Create a virtual path for this CSS that can be identified in onLoad
                const virtualName =
                  `${entryInfo.outputName}_${entryInfo.virtualCssCounter}`;
                entryInfo.virtualCssCounter++;
                const virtualPath = `__virtual_css/${virtualName}.css`;

                nonEntryCssImports!.set(virtualPath, {
                  originalPath: path.basename(args.path),
                  resolveDir: path.dirname(resolvedPath),
                  bundledCss: "",
                });

                return {
                  path: virtualPath,
                  namespace: "css-plugin-virtual",
                };
              }
            }
          }

          // For @import rules, resolve the path (existing behavior)
          if (args.kind === "import-rule") {
            return {
              path: resolvedPath,
            };
          }

          // For other import kinds (import-statement), let esbuild handle normally
          return null;
        },
      );

      // Load CSS files and inline @import rules
      // When emitFile is enabled, we need to intercept entry point loads too,
      // so we remove the namespace filter to catch loads from any namespace
      ctx.onLoad(
        { filter: /\.css$/, namespace: emitFile ? undefined : "file" },
        async (args): Promise<esbuild.OnLoadResult> => {
          const filePath = args.path;

          // Handle virtual CSS entries (non-entry CSS imports from JS/TSX entries)
          if (emitFile && args.namespace === "css-plugin-virtual") {
            const entry = nonEntryCssImports!.get(filePath)!;

            // Load and resolve the original CSS
            const cssFilePath = path.resolve(
              entry.resolveDir,
              entry.originalPath,
            );
            let cssContent: string;
            try {
              cssContent = await fetch(
                path.toFileUrl(cssFilePath),
              ).then((r) => r.text());
            } catch {
              cssContent = await Deno.readTextFile(cssFilePath);
            }

            // Resolve @import rules recursively
            const bundledCss = await resolveImports(
              cssContent,
              entry.resolveDir,
              new Set(),
            );
            entry.bundledCss = bundledCss;

            return {
              contents: bundledCss,
              loader: "css",
              resolveDir: entry.resolveDir,
            };
          }

          const fileUrl = path.toFileUrl(filePath);
          let cssContent: string;

          try {
            cssContent = await fetch(fileUrl).then((r) => r.text());
          } catch {
            // Fallback for environments where fetch with file:// may not work
            cssContent = await Deno.readTextFile(filePath);
          }

          // Resolve @import rules recursively (pass already-loaded content)
          const resolvedCss = await resolveImports(
            cssContent,
            path.dirname(filePath),
            new Set(),
          );

          return {
            contents: resolvedCss,
            loader: "css",
            resolveDir: path.dirname(filePath),
          };
        },
      );

      // Inject virtual CSS files into outputFiles when emitFile is enabled
      ctx.onEnd((result) => {
        if (!emitFile || !result.outputFiles || !nonEntryCssImports) return;

        for (const [_virtualPath, entry] of nonEntryCssImports!) {
          if (entry.bundledCss) {
            const outputFile: VirtualOutputFile = {
              path: _virtualPath,
              contents: new TextEncoder().encode(entry.bundledCss),
              hash: "",
              get text() {
                return new TextDecoder().decode(this.contents);
              },
            };
            // deno-lint-ignore no-explicit-any
            result.outputFiles.push(outputFile as any);
          }
        }
      });
    },
  };

  /**
   * Recursively resolve all @import rules in CSS content.
   */
  async function resolveImports(
    css: string,
    baseDir: string,
    visited: Set<string> = new Set(),
  ): Promise<string> {
    const importPattern = /@import\s+(?:url\()?["']([^"']+)["']\)?[^;]*;/g;

    const imports: Array<{ match: string; path: string; start: number }> = [];

    // Find all @import statements
    for (const match of css.matchAll(importPattern)) {
      const pathMatch = match[1];
      if (!pathMatch) continue;

      // Skip external URLs (already handled by onResolve)
      if (pathMatch.startsWith("https://") || pathMatch.startsWith("http://")) {
        continue;
      }

      imports.push({
        match: match[0],
        path: pathMatch,
        start: match.index!,
      });
    }

    if (imports.length === 0) {
      return css;
    }

    let result = css;

    // Process imports in reverse order to preserve correct positions
    for (const { match, path: importPath, start } of imports.reverse()) {
      const resolvedPath = path.resolve(baseDir, importPath);

      // Prevent infinite recursion from circular imports
      if (visited.has(resolvedPath)) {
        result = result.replace(match, `/* @import circular: ${importPath} */`);
        continue;
      }

      visited.add(resolvedPath);

      let importedCss: string;
      try {
        const fileUrl = path.toFileUrl(resolvedPath);
        importedCss = await fetch(fileUrl).then((r) => r.text());
      } catch {
        importedCss = await Deno.readTextFile(resolvedPath);
      }

      // Recursively resolve nested @imports, passing a NEW set that includes
      // the current chain so sibling imports don't share cycle-detection state
      const nestedResolved = await resolveImports(
        importedCss,
        path.dirname(resolvedPath),
        new Set([...visited, resolvedPath]),
      );

      // Replace @import with the resolved content
      result = result.slice(0, start) +
        nestedResolved +
        result.slice(start + match.length);
    }

    // Re-process the CSS in case there are remaining @imports
    // (but only if we actually replaced something)
    const stillHasImports = /@import\s+(?:url\()?["'][^"']+["']\)?[^;]*;/.test(
      result,
    );

    if (stillHasImports) {
      result = await resolveImports(result, baseDir, visited);
    }

    return result;
  }
}
