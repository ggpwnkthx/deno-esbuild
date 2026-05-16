import * as esbuild from "esbuild";
import { assertEquals, assertStringIncludes } from "@std/assert";
import { cssPlugin } from "../mod.ts";

Deno.test({
  name: "cssPlugin - resolves local relative @import within a CSS bundle",
  fn: async () => {
    const tmpDir = await Deno.makeTempDir();
    try {
      const base = `${tmpDir}/base.css`;
      const imported = `${tmpDir}/imported.css`;
      await Deno.writeTextFile(imported, `.imported { color: red; }`);
      await Deno.writeTextFile(
        base,
        `@import "./imported.css";.base { color: blue; }`,
      );

      const result = await esbuild.build({
        entryPoints: [base],
        bundle: true,
        plugins: [cssPlugin()],
        write: false,
      });

      const output = result.outputFiles[0].text;
      assertStringIncludes(output, ".base");
      assertStringIncludes(output, ".imported");
      assertStringIncludes(output, "color: blue");
      assertStringIncludes(output, "color: red");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "cssPlugin - marks remote @import (https://) as external",
  fn: async () => {
    const tmpDir = await Deno.makeTempDir();
    try {
      const base = `${tmpDir}/base.css`;
      await Deno.writeTextFile(
        base,
        `@import "https://example.com/theme.css";.base { color: blue; }`,
      );

      const result = await esbuild.build({
        entryPoints: [base],
        bundle: true,
        plugins: [cssPlugin()],
        write: false,
        external: ["https://example.com/*"],
      });

      const output = result.outputFiles[0].text;
      // Remote import should be marked external and not inlined
      assertStringIncludes(output, "https://example.com/theme.css");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "cssPlugin - handles nested @import chains",
  fn: async () => {
    const tmpDir = await Deno.makeTempDir();
    try {
      const level1 = `${tmpDir}/level1.css`;
      const level2 = `${tmpDir}/level2.css`;
      const level3 = `${tmpDir}/level3.css`;

      await Deno.writeTextFile(level3, `.level3 { color: green; }`);
      await Deno.writeTextFile(
        level2,
        `@import "./level3.css";.level2 { color: blue; }`,
      );
      await Deno.writeTextFile(
        level1,
        `@import "./level2.css";.level1 { color: red; }`,
      );

      const result = await esbuild.build({
        entryPoints: [level1],
        bundle: true,
        plugins: [cssPlugin()],
        write: false,
      });

      const output = result.outputFiles[0].text;
      assertStringIncludes(output, ".level1");
      assertStringIncludes(output, ".level2");
      assertStringIncludes(output, ".level3");
      assertStringIncludes(output, "color: red");
      assertStringIncludes(output, "color: blue");
      assertStringIncludes(output, "color: green");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "cssPlugin - emits CSS correctly via esbuild's built-in loader",
  fn: async () => {
    const tmpDir = await Deno.makeTempDir();
    try {
      const entry = `${tmpDir}/entry.css`;
      const imgFile = `${tmpDir}/img.png`;
      // Create a minimal placeholder file for url() resolution
      await Deno.writeTextFile(imgFile, "");
      await Deno.writeTextFile(
        entry,
        `.entry { background: url("./img.png"); }`,
      );

      const result = await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        plugins: [cssPlugin()],
        write: false,
        loader: { ".css": "css", ".png": "dataurl" },
      });

      const output = result.outputFiles[0].text;
      // url() should be passed through to esbuild's CSS loader
      assertStringIncludes(output, ".entry");
      assertStringIncludes(output, "background");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "cssPlugin - supports @import with url() syntax",
  fn: async () => {
    const tmpDir = await Deno.makeTempDir();
    try {
      const base = `${tmpDir}/base.css`;
      const imported = `${tmpDir}/imported.css`;
      await Deno.writeTextFile(imported, `.imported { font-size: 14px; }`);
      await Deno.writeTextFile(
        base,
        `@import url("./imported.css");.base { font-weight: bold; }`,
      );

      const result = await esbuild.build({
        entryPoints: [base],
        bundle: true,
        plugins: [cssPlugin()],
        write: false,
      });

      const output = result.outputFiles[0].text;
      assertStringIncludes(output, ".base");
      assertStringIncludes(output, ".imported");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name:
    "cssPlugin - shared dependency imported by multiple siblings is not falsely flagged circular",
  fn: async () => {
    const tmpDir = await Deno.makeTempDir();
    try {
      const a = `${tmpDir}/a.css`;
      const b = `${tmpDir}/b.css`;
      const c = `${tmpDir}/c.css`;
      const shared = `${tmpDir}/shared.css`;

      await Deno.writeTextFile(shared, `.shared { color: green; }`);
      await Deno.writeTextFile(
        b,
        `@import "./shared.css";\n.b { color: blue; }`,
      );
      await Deno.writeTextFile(
        c,
        `@import "./shared.css";\n.c { color: red; }`,
      );
      await Deno.writeTextFile(
        a,
        `@import "./b.css";\n@import "./c.css";\n.a { color: yellow; }`,
      );

      const result = await esbuild.build({
        entryPoints: [a],
        bundle: true,
        plugins: [cssPlugin()],
        write: false,
      });

      const output = result.outputFiles[0].text;
      // shared.css content should appear TWICE (once from b.css, once from c.css)
      // NOT replaced with a circular comment
      const sharedCount = (output.match(/\.shared\s*\{/g) || []).length;
      assertEquals(
        sharedCount,
        2,
        `Expected .shared to appear twice, got ${sharedCount}`,
      );
      assertStringIncludes(output, ".b");
      assertStringIncludes(output, ".c");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name:
    "cssPlugin with emitFile - emits CSS as separate file for CSS entry point",
  fn: async () => {
    const tmpDir = await Deno.makeTempDir();
    try {
      const entry = `${tmpDir}/entry.css`;
      const imported = `${tmpDir}/imported.css`;
      await Deno.writeTextFile(imported, `.imported { color: red; }`);
      await Deno.writeTextFile(
        entry,
        `@import "./imported.css";\n.entry { color: blue; }`,
      );

      const result = await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        plugins: [cssPlugin({ emitFile: true })],
        write: false,
      });

      // With emitFile: true and a CSS entry point, outputFiles should contain
      // the bundled CSS. esbuild may output to stdout (path "<stdout>") when
      // write: false, so we just check the content exists.
      assertEquals(result.outputFiles.length, 1);
      const cssOutput = result.outputFiles[0].text;
      assertStringIncludes(cssOutput, ".entry");
      assertStringIncludes(cssOutput, ".imported");
      assertStringIncludes(cssOutput, "color: blue");
      assertStringIncludes(cssOutput, "color: red");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name:
    "cssPlugin with emitFile - injects CSS imported from nested non-entry point route",
  fn: async () => {
    const tmpDir = await Deno.makeTempDir();
    try {
      // Create entry point
      const routesDir = `${tmpDir}/routes`;
      const blogDir = `${routesDir}/blog`;
      const entryPoint = `${routesDir}/index.tsx`;
      const nestedRoute = `${blogDir}/[slug].tsx`;
      const cssFile = `${routesDir}/index.css`;

      await Deno.mkdir(blogDir, { recursive: true });

      // CSS file imported by nested route
      await Deno.writeTextFile(cssFile, `.main { color: blue; }`);

      // Entry point imports the nested route (which imports CSS)
      await Deno.writeTextFile(
        entryPoint,
        `import "./blog/[slug]";\nexport const App = () => null;`,
      );

      // Nested route (NOT an entry point) imports the CSS
      await Deno.writeTextFile(
        nestedRoute,
        `import "../index.css";\nexport const BlogPost = () => null;`,
      );

      const result = await esbuild.build({
        entryPoints: [entryPoint],
        bundle: true,
        outdir: tmpDir,
        plugins: [cssPlugin({ emitFile: true })],
        write: false,
      });

      // CSS files with __virtual_css should be present in outputFiles
      // even though the CSS is imported from a non-entry point in a subdirectory
      const cssFiles = result.outputFiles.filter((f) =>
        f.path.includes("__virtual_css")
      );
      assertEquals(cssFiles.length, 1);
      const cssOutput = cssFiles[0].text;
      assertStringIncludes(cssOutput, ".main");
      assertStringIncludes(cssOutput, "color: blue");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name:
    "cssPlugin with emitFile - injects CSS imported from non-CSS entry point (TSX) into outputFiles",
  fn: async () => {
    const tmpDir = await Deno.makeTempDir();
    try {
      const tsxEntry = `${tmpDir}/index.tsx`;
      const importedCss = `${tmpDir}/styles/button.css`;
      const nestedCss = `${tmpDir}/styles/variables.css`;

      await Deno.mkdir(`${tmpDir}/styles`, { recursive: true });
      await Deno.writeTextFile(nestedCss, `:root { --primary: blue; }`);
      await Deno.writeTextFile(
        importedCss,
        `@import "./variables.css";\n.button { color: var(--primary); }`,
      );
      await Deno.writeTextFile(
        tsxEntry,
        `import "./styles/button.css";\nexport const App = () => null;`,
      );

      const result = await esbuild.build({
        entryPoints: [tsxEntry],
        bundle: true,
        outdir: tmpDir,
        plugins: [cssPlugin({ emitFile: true })],
        write: false,
      });

      // outputFiles should contain both the JS bundle and the injected CSS
      // The CSS should have the nested @import resolved
      const cssFiles = result.outputFiles.filter((f) =>
        f.path.includes("__virtual_css")
      );
      assertEquals(cssFiles.length, 1);
      const cssOutput = cssFiles[0].text;
      assertStringIncludes(cssOutput, ".button");
      assertStringIncludes(cssOutput, "color: var(--primary)");
      assertStringIncludes(cssOutput, ":root");
      assertStringIncludes(cssOutput, "--primary: blue");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
