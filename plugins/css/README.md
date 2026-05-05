# `@ggpwnkthx/esbuild-plugin-css`

An esbuild plugin that resolves and inlines CSS `@import` rules.

## What it does

This plugin intercepts `.css` file loads in the `file` namespace and recursively
resolves all `@import` rules, replacing them with the actual imported CSS
content. It handles:

- **Relative `@import` paths** — resolved to absolute file paths and inlined
- **External URLs** (`https://`, `http://`) — marked as external, not inlined
- **Circular imports** — detected and replaced with a comment to avoid infinite
  loops
- **File URL fallback** — uses `Deno.readTextFile` when `fetch` with `file://`
  fails

## Quick start

```ts
import * as esbuild from "esbuild";
import { cssPlugin } from "@ggpwnkthx/esbuild-plugin-css";

await esbuild.build({
  entryPoints: ["./src/index.ts"],
  bundle: true,
  outdir: "./dist",
  plugins: [cssPlugin()],
});
```

## How `@import` resolution works

1. **Resolve phase** (`onResolve`): When esbuild encounters an `@import` rule
   inside a CSS file, the plugin intercepts it (filtering by
   `kind === "import-rule"`). Relative paths are resolved to absolute paths
   using the importer's directory as the base. External `https://` and `http://`
   URLs are marked `external: true` so esbuild passes them through unchanged.

2. **Load phase** (`onLoad`): Once a CSS file's path is resolved, the plugin
   reads its content (first via `fetch` with a `file://` URL, falling back to
   `Deno.readTextFile`). It then calls `resolveImports` to find and replace
   every `@import` rule.

3. **Recursive inlining**: `resolveImports` processes all `@import` rules it
   finds, resolves each one to an absolute path, reads that file, and
   recursively resolves any `@import`s inside it. The resolved content replaces
   the `@import` rule in the output.

4. **Repeat**: After replacing imports, the result is scanned again for any
   remaining `@import` rules (e.g., from sibling imports that were added), and
   the process repeats until no `@import` rules remain.

## Circular import handling

The plugin tracks visited file paths in a `Set`. When it encounters a file that
has already been visited in the current import chain, it replaces the `@import`
rule with:

```css
/* @import circular: <path> */
```

This prevents infinite recursion while still producing valid CSS output.

## Fallback for `file://` URLs

Some environments do not support `fetch` with `file://` URLs. If the initial
`fetch` throws, the plugin falls back to `Deno.readTextFile(filePath)` to read
the CSS content directly from the filesystem.
