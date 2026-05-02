import * as esbuild from "esbuild";
import * as path from "@std/path";

export interface HtmlPluginOptions {
  /**
   * Additional options passed to `esbuild.transform()` when transpiling
   * script tags (e.g. `{ minify: true, target: "es2020" }`).
   */
  transformOptions?: esbuild.TransformOptions;
}

/**
 * Create an esbuild plugin that processes HTML entrypoints by inlining
 * TypeScript script tags and CSS stylesheet links.
 *
 * The plugin parses `<script type="module" src="*.ts">` and
 * `<link rel="stylesheet" href="*.css">` tags inside HTML files used as
 * entrypoints, transforms the script content via esbuild, reads and inlines
 * the CSS content, then outputs the modified HTML.
 *
 * @param options - Configuration for the plugin
 * @returns An esbuild plugin to pass to `esbuild.build()`
 *
 * @example
 * ```ts
 * import * as esbuild from "esbuild";
 * import { htmlPlugin } from "@deno/esbuild/plugins/html";
 *
 * await esbuild.build({
 *   entryPoints: ["./index.html"],
 *   plugins: [htmlPlugin({ transformOptions: { minify: true } })],
 * });
 * ```
 */
export function htmlPlugin(options: HtmlPluginOptions = {}): esbuild.Plugin {
  return {
    name: "html",

    setup(ctx) {
      ctx.onLoad(
        { filter: /\.html$/, namespace: "file" },
        async (args: esbuild.OnLoadArgs) => {
          const htmlPath = args.path;
          const htmlDir = path.dirname(htmlPath);
          let html = await Deno.readTextFile(htmlPath);

          // ---- Inline script tags -----------------------------------
          const scriptRe =
            /<script\s+type="module"\s+src="([^"]+\.tsx?)"[^>]*>[\s\S]*?<\/script>/gi;
          const scriptMatches: Array<{ tag: string; src: string }> = [];
          for (const match of html.matchAll(scriptRe)) {
            scriptMatches.push({ tag: match[0], src: match[1] });
          }

          for (const { tag, src } of scriptMatches) {
            const filePath = path.resolve(htmlDir, src);
            try {
              const code = await Deno.readTextFile(filePath);
              const result = await esbuild.transform(code, {
                loader: "tsx",
                ...options.transformOptions,
              });
              html = html.replaceAll(
                tag,
                `<script type="module">${result.code}</script>`,
              );
            } catch {
              html = html.replaceAll(
                tag,
                `<!-- could not inline script: ${src} -->`,
              );
            }
          }

          // ---- Inline stylesheet links ------------------------------
          const linkRe = /<link\s+rel="stylesheet"\s+href="([^"]+\.css)"[^>]*>\s*/gi;
          for (const match of html.matchAll(linkRe)) {
            const tag = match[0];
            const href = match[1];
            const filePath = path.resolve(htmlDir, href);
            try {
              let css = await Deno.readTextFile(filePath);
              // Escape </style to prevent HTML parser breakout
              css = css.replaceAll("</style", "<\\/style>");
              html = html.replaceAll(tag, `<style>${css}</style>`);
            } catch {
              html = html.replaceAll(
                tag,
                `<!-- could not inline stylesheet: ${href} -->`,
              );
            }
          }

          return { contents: html, resolveDir: htmlDir };
        },
      );
    },
  };
}
