import type * as esbuild from "esbuild";
import * as path from "@std/path";

/**
 * esbuild plugin that loads CSS files and resolves `@import` rules.
 * @param _options - Plugin options (currently unused).
 * @returns An esbuild plugin that resolves local `@import` paths and inlines them.
 */
export function cssPlugin(_options: object = {}): esbuild.Plugin {
  return {
    name: "css",

    setup(ctx) {
      // Intercept @import rules to resolve relative paths
      ctx.onResolve(
        { filter: /\.css$/ },
        (args): esbuild.OnResolveResult | null => {
          // Only handle @import rules, pass through everything else
          if (args.kind !== "import-rule") {
            return null;
          }

          // External URL imports — mark as external
          if (
            args.path.startsWith("https://")
            || args.path.startsWith("http://")
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

          return {
            path: resolvedPath,
          };
        },
      );

      // Load CSS files and inline @import rules
      ctx.onLoad(
        { filter: /\.css$/, namespace: "file" },
        async (args): Promise<esbuild.OnLoadResult> => {
          const filePath = args.path;
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
      result = result.slice(0, start)
        + nestedResolved
        + result.slice(start + match.length);
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
