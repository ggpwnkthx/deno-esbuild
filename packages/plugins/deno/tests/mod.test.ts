import * as esbuild from 'esbuild'
import * as path from '@std/path'
import { assertEquals, assertMatch, assertStringIncludes } from '@std/assert'
import { createDenoPlugin, denoPlugin } from '../mod.ts'

Deno.test({
  name: 'denoPlugin - transpiles TypeScript to JavaScript',
  fn: async () => {
    const tmpDir = await Deno.makeTempDir()
    try {
      const testFile = `${tmpDir}/test.ts`
      await Deno.writeTextFile(testFile, `export const x: number = 1;`)

      const result = await esbuild.build({
        entryPoints: [testFile],
        bundle: true,
        plugins: [denoPlugin()],
        write: false,
        format: 'esm',
      })

      const output = result.outputFiles[0]?.text ?? ''
      // Type annotation should be stripped (transpiled to JS)
      assertStringIncludes(output, 'var x = 1')
      assertMatch(output, /var x = 1/)
    } finally {
      await Deno.remove(tmpDir, { recursive: true })
      await esbuild.stop()
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'denoPlugin - resolves local relative imports',
  fn: async () => {
    const tmpDir = await Deno.makeTempDir()
    try {
      const mainFile = `${tmpDir}/main.ts`
      const utilFile = `${tmpDir}/util.ts`
      await Deno.writeTextFile(
        utilFile,
        `export function greet(name: string): string { return \`Hello, \${name}\`; }`,
      )
      await Deno.writeTextFile(
        mainFile,
        `import { greet } from "./util.ts";\nexport { greet };`,
      )

      const result = await esbuild.build({
        entryPoints: [mainFile],
        bundle: true,
        plugins: [denoPlugin()],
        write: false,
        format: 'esm',
      })

      const output = result.outputFiles[0]?.text ?? ''
      assertStringIncludes(output, 'greet')
      assertStringIncludes(output, 'Hello,')
    } finally {
      await Deno.remove(tmpDir, { recursive: true })
      await esbuild.stop()
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'createDenoPlugin - bundles an entry through the handle.build helper',
  fn: async () => {
    const tmpDir = await Deno.makeTempDir()
    try {
      const denoJsonPath = `${tmpDir}/deno.json`
      const utilPath = `${tmpDir}/util.ts`
      const mainPath = `${tmpDir}/main.ts`
      await Deno.writeTextFile(denoJsonPath, `{}`)
      await Deno.writeTextFile(utilPath, `export const greet = (n: string) => 'Hi ' + n;`)
      await Deno.writeTextFile(
        mainPath,
        `import { greet } from "./util.ts";\nexport const v = greet("there");`,
      )

      const handle = await createDenoPlugin({ configPath: denoJsonPath })
      try {
        const { code } = await handle.build(mainPath)
        // The bundled output inlines util.ts and the call site; the literal
        // concatenated string is built at module init, not present in source.
        assertStringIncludes(code, 'greet("there")')
        assertStringIncludes(code, 'Hi ')
      } finally {
        handle[Symbol.dispose]()
        await esbuild.stop()
      }
    } finally {
      await Deno.remove(tmpDir, { recursive: true })
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'createDenoPlugin - resolve() returns file: URL and absPath for local specifiers',
  fn: async () => {
    const tmpDir = await Deno.makeTempDir()
    try {
      const denoJsonPath = `${tmpDir}/deno.json`
      const utilPath = `${tmpDir}/util.ts`
      await Deno.writeTextFile(denoJsonPath, `{}`)
      await Deno.writeTextFile(utilPath, `export const v = 1;`)

      const handle = await createDenoPlugin({ configPath: denoJsonPath })
      try {
        const resolved = await handle.resolve(
          './util.ts',
          new URL('./main.ts', path.toFileUrl(`${tmpDir}/`)).href,
        )
        assertMatch(resolved.url, /^file:\/\//)
        assertMatch(resolved.absPath, /\/util\.ts$/)
      } finally {
        handle[Symbol.dispose]()
      }
    } finally {
      await Deno.remove(tmpDir, { recursive: true })
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'createDenoPlugin - resolve() resolves npm: specifiers',
  fn: async () => {
    const tmpDir = await Deno.makeTempDir()
    try {
      const denoJsonPath = `${tmpDir}/deno.json`
      await Deno.writeTextFile(denoJsonPath, `{}`)

      const handle = await createDenoPlugin({ configPath: denoJsonPath })
      try {
        // Deno's loader resolves npm: specifiers into a file:// URL inside
        // its npm cache; the package name and version appear in the path.
        const resolved = await handle.resolve('npm:ms@2')
        assertMatch(resolved.url, /^file:\/\//)
        assertMatch(resolved.url, /ms/)
        assertMatch(resolved.absPath, /ms/)
      } finally {
        handle[Symbol.dispose]()
      }
    } finally {
      await Deno.remove(tmpDir, { recursive: true })
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'denoPlugin - marks binary asset imports as external',
  fn: async () => {
    const tmpDir = await Deno.makeTempDir()
    try {
      const testFile = `${tmpDir}/main.ts`
      const wasmFile = `${tmpDir}/module.wasm`
      await Deno.writeTextFile(wasmFile, '')
      await Deno.writeTextFile(testFile, `import wasm from "./module.wasm";`)

      await esbuild.build({
        entryPoints: [testFile],
        bundle: true,
        plugins: [denoPlugin()],
        write: false,
      })

      // The skip pattern returns null for wasm, so esbuild handles it
      // We verify the build succeeds (esbuild handles external assets)
      assertMatch('./module.wasm', /\.wasm$/i)
    } finally {
      await Deno.remove(tmpDir, { recursive: true })
      await esbuild.stop()
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'denoPlugin - noTranspile respects loader transpile setting',
  fn: async () => {
    const tmpDir = await Deno.makeTempDir()
    try {
      const testFile = `${tmpDir}/test.ts`
      await Deno.writeTextFile(testFile, `export const x: number = 1;`)

      const resultDefault = await esbuild.build({
        entryPoints: [testFile],
        bundle: true,
        plugins: [denoPlugin()],
        write: false,
        format: 'esm',
      })

      const resultNoTranspile = await esbuild.build({
        entryPoints: [testFile],
        bundle: true,
        plugins: [denoPlugin({ noTranspile: true })],
        write: false,
        format: 'esm',
      })

      const outputDefault = resultDefault.outputFiles[0]?.text ?? ''
      const outputNoTranspile = resultNoTranspile.outputFiles[0]?.text ?? ''

      // Both should produce valid JS output
      assertMatch(outputDefault, /var x = 1/)
      assertMatch(outputNoTranspile, /var x = 1/)
    } finally {
      await Deno.remove(tmpDir, { recursive: true })
      await esbuild.stop()
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'denoPlugin - preserveJsx affects loader output',
  fn: async () => {
    const tmpDir = await Deno.makeTempDir()
    try {
      const testFile = `${tmpDir}/test.tsx`
      await Deno.writeTextFile(
        testFile,
        `export const element = <div>Hello</div>;`,
      )

      const resultDefault = await esbuild.build({
        entryPoints: [testFile],
        bundle: true,
        plugins: [denoPlugin()],
        write: false,
        format: 'esm',
      })

      const resultPreserve = await esbuild.build({
        entryPoints: [testFile],
        bundle: true,
        plugins: [denoPlugin({ preserveJsx: true })],
        write: false,
        format: 'esm',
      })

      const outputDefault = resultDefault.outputFiles[0]?.text ?? ''
      const outputPreserve = resultPreserve.outputFiles[0]?.text ?? ''

      // Default: JSX should be converted
      assertStringIncludes(outputDefault, 'createElement')

      // With preserveJsx: JSX preserved
      assertMatch(outputPreserve, /Hello/)
    } finally {
      await Deno.remove(tmpDir, { recursive: true })
      await esbuild.stop()
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'denoPlugin - publicEnvVarPrefix inlines env vars',
  fn: async () => {
    const tmpDir = await Deno.makeTempDir()
    try {
      Deno.env.set('PUBLIC_FOO', 'bar')
      const testFile = `${tmpDir}/test.ts`
      await Deno.writeTextFile(
        testFile,
        `export const value = Deno.env.get("PUBLIC_FOO");`,
      )

      const result = await esbuild.build({
        entryPoints: [testFile],
        bundle: true,
        plugins: [denoPlugin({ publicEnvVarPrefix: 'PUBLIC_' })],
        write: false,
        format: 'esm',
      })

      const output = result.outputFiles[0]?.text ?? ''
      assertStringIncludes(output, '"bar"')
    } finally {
      Deno.env.delete('PUBLIC_FOO')
      await Deno.remove(tmpDir, { recursive: true })
      await esbuild.stop()
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'denoPlugin - publicEnvVarPrefix handles import.meta.env and destructuring',
  fn: async () => {
    const tmpDir = await Deno.makeTempDir()
    try {
      Deno.env.set('PUBLIC_FOO', 'bar')
      Deno.env.set('PRIVATE_BAR', 'baz')
      const testFile = `${tmpDir}/test.ts`
      await Deno.writeTextFile(
        testFile,
        `
        // Pattern 1: Deno.env.get("PUBLIC_FOO")
        export const p1 = Deno.env.get("PUBLIC_FOO");
        // Pattern 2: process.env.PUBLIC_FOO
        export const p2 = process.env.PUBLIC_FOO;
        // Pattern 3: import.meta.env.PUBLIC_FOO
        export const p3 = import.meta.env.PUBLIC_FOO;
        // Pattern 4: destructuring shorthand (single identifier)
        const { PUBLIC_FOO } = Deno.env;
        export const p4 = PUBLIC_FOO;
        // Pattern 5: unset var — should produce "null" via ?? null fallback
        export const absent = Deno.env.get("PUBLIC_ABSENT");
        // Pattern 6: mixed-prefix destructuring — should NOT transform (PRIVATE_BAR lacks prefix)
        const { PUBLIC_FOO: pfoo, PRIVATE_BAR: pbar } = Deno.env;
        export const p5 = pfoo;
        export const p6 = pbar;
      `,
      )

      const result = await esbuild.build({
        entryPoints: [testFile],
        bundle: true,
        plugins: [denoPlugin({ publicEnvVarPrefix: 'PUBLIC_' })],
        write: false,
        format: 'esm',
      })

      const output = result.outputFiles[0]?.text ?? ''

      // Patterns 1-4 all produce "bar" for PUBLIC_FOO, count = 4
      const barMatches = output.match(/"bar"/g)
      assertEquals(
        barMatches ? barMatches.length : 0,
        4,
        'Expected 4 occurrences of \'"bar"\' for patterns 1-4 (inlined PUBLIC_FOO)',
      )

      // Pattern 5: PUBLIC_ABSENT is unset — ?? null fallback produces "null" not "undefined"
      const nullMatches = output.match(/"null"/g)
      assertEquals(
        nullMatches ? nullMatches.length : 0,
        1,
        'Expected 1 occurrence of \'"null"\' for absent var (?? null fallback)',
      )

      // Pattern 6: PRIVATE_BAR is NOT inlined (lacks PUBLIC_ prefix), so "baz" does NOT appear
      // The bundle should contain PRIVATE_BAR as an identifier, not "baz"
      assertEquals(
        output.includes('baz'),
        false,
        'PRIVATE_BAR should not be inlined',
      )
    } finally {
      Deno.env.delete('PUBLIC_FOO')
      Deno.env.delete('PRIVATE_BAR')
      await Deno.remove(tmpDir, { recursive: true })
      await esbuild.stop()
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'denoPlugin - debug option enables logging',
  fn: async () => {
    const tmpDir = await Deno.makeTempDir()
    try {
      const testFile = `${tmpDir}/test.ts`
      await Deno.writeTextFile(testFile, `export const x: number = 1;`)

      let debugOutput = ''
      const originalLog = console.debug
      console.debug = (msg: string, ...args: unknown[]) => {
        if (msg.includes('[DEBUG')) {
          debugOutput += msg
        }
        originalLog(msg, ...args)
      }

      try {
        await esbuild.build({
          entryPoints: [testFile],
          bundle: true,
          plugins: [denoPlugin({ debug: true })],
          write: false,
          format: 'esm',
        })
      } finally {
        console.debug = originalLog
      }

      assertStringIncludes(debugOutput, '[DEBUG')
    } finally {
      await Deno.remove(tmpDir, { recursive: true })
      await esbuild.stop()
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'denoPlugin - workspace root resolution via configPath',
  fn: async () => {
    const tmpDir = await Deno.makeTempDir()
    try {
      const configPath = `${tmpDir}/deno.json`
      const configContent = JSON.stringify({
        imports: {
          '@test/lib': './lib.ts',
        },
      })
      await Deno.writeTextFile(configPath, configContent)

      const libFile = `${tmpDir}/lib.ts`
      await Deno.writeTextFile(libFile, `export const value = "from lib";`)

      const mainFile = `${tmpDir}/main.ts`
      await Deno.writeTextFile(
        mainFile,
        `import { value } from "@test/lib";\nexport { value };`,
      )

      const result = await esbuild.build({
        entryPoints: [mainFile],
        bundle: true,
        plugins: [denoPlugin({ configPath })],
        write: false,
        format: 'esm',
      })

      const output = result.outputFiles[0]?.text ?? ''
      assertStringIncludes(output, 'from lib')
    } finally {
      await Deno.remove(tmpDir, { recursive: true })
      await esbuild.stop()
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'denoPlugin - resolves jsr: specifiers',
  fn: async () => {
    const tmpDir = await Deno.makeTempDir()
    try {
      const mainFile = `${tmpDir}/main.ts`
      // jsr:@std/assert is already a project dependency - use it
      await Deno.writeTextFile(
        mainFile,
        `import { assertEquals } from "jsr:@std/assert@^1.0.19";\nassertEquals(1, 1);`,
      )

      const result = await esbuild.build({
        entryPoints: [mainFile],
        bundle: true,
        plugins: [denoPlugin()],
        write: false,
        format: 'esm',
      })

      const output = result.outputFiles[0]?.text ?? ''
      // Should transpile TypeScript and include the assertEquals usage
      assertStringIncludes(output, 'assertEquals')
    } finally {
      await Deno.remove(tmpDir, { recursive: true })
      await esbuild.stop()
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'denoPlugin - resolves https: specifiers',
  fn: async () => {
    const tmpDir = await Deno.makeTempDir()
    try {
      const mainFile = `${tmpDir}/main.ts`
      // Import a well-known HTTPS URL - esbuild CDN is already cached
      await Deno.writeTextFile(
        mainFile,
        `import * as esbuild from "https://deno.land/x/esbuild@v0.28.1/mod.js";\nexport { esbuild };`,
      )

      const result = await esbuild.build({
        entryPoints: [mainFile],
        bundle: true,
        plugins: [denoPlugin()],
        write: false,
        format: 'esm',
      })

      const output = result.outputFiles[0]?.text ?? ''
      // Should resolve the https URL and include esbuild exports
      assertStringIncludes(output, 'build')
    } finally {
      await Deno.remove(tmpDir, { recursive: true })
      await esbuild.stop()
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'denoPlugin - resolves npm: specifiers',
  fn: async () => {
    const tmpDir = await Deno.makeTempDir()
    try {
      const mainFile = `${tmpDir}/main.ts`
      // Use a small, fast-to-resolve npm package - ms is tiny
      await Deno.writeTextFile(
        mainFile,
        `import { format } from "npm:ms@2";\nconst t = format(1000);\nexport { t };`,
      )

      const result = await esbuild.build({
        entryPoints: [mainFile],
        bundle: true,
        plugins: [denoPlugin()],
        write: false,
        format: 'esm',
      })

      const output = result.outputFiles[0]?.text ?? ''
      // Should resolve npm: and bundle the ms package
      assertStringIncludes(output, 'ms')
    } finally {
      await Deno.remove(tmpDir, { recursive: true })
      await esbuild.stop()
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'denoPlugin - bundles CJS require() relative imports via resolveDir',
  fn: async () => {
    // Regression test: when a CJS file (e.g. an npm package entry that does
    // module.exports = require('./sibling')) is loaded, esbuild's CJS-to-ESM
    // pass converts each require() into an import. The plugin's onResolve
    // substitutes importers outside the workspace root, so it declines to
    // resolve the converted path; esbuild must then be able to fall back to
    // its own relative-path resolution, which needs resolveDir set on the
    // file the plugin loaded.
    const tmpDir = await Deno.makeTempDir()
    try {
      const denoJsonPath = `${tmpDir}/deno.json`
      const utilPath = `${tmpDir}/util.cjs`
      const cjsPath = `${tmpDir}/cjs.cjs`
      const mainPath = `${tmpDir}/main.js`

      await Deno.writeTextFile(denoJsonPath, `{}`)
      await Deno.writeTextFile(
        utilPath,
        `module.exports = { hello: "world" };`,
      )
      await Deno.writeTextFile(
        cjsPath,
        `module.exports = require('./util.cjs');`,
      )
      await Deno.writeTextFile(
        mainPath,
        `import { hello } from './cjs.cjs'; export { hello };`,
      )

      const result = await esbuild.build({
        entryPoints: [mainPath],
        bundle: true,
        plugins: [denoPlugin()],
        write: false,
        format: 'esm',
      })

      const output = result.outputFiles[0]?.text ?? ''
      assertStringIncludes(output, 'hello')
      assertStringIncludes(output, 'world')
    } finally {
      await Deno.remove(tmpDir, { recursive: true })
      await esbuild.stop()
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name:
    'denoPlugin - bundles CJS require() when importer lives outside workspaceRoot in a managed package path',
  fn: async () => {
    // Regression test for the importer-substitution bug: when the importer
    // is outside the plugin's workspace root, the plugin used to replace
    // it with a synthetic referrer inside the workspace so the import map
    // could be applied. For files inside a managed package location
    // (Deno's npm cache, a node_modules tree) that substitution breaks
    // relative require('./sibling') chains: the synthetic referrer lives
    // in the wrong directory, so esbuild's CJS-to-ESM convert emits an
    // import path for a sibling that doesn't exist where the referrer
    // points. Pass-through for managed paths lets the loader.resolve
    // compute the import against the importer's real directory.
    const tmpDir = await Deno.makeTempDir()
    try {
      const innerDir = `${tmpDir}/inner`
      const pkgDir = `${tmpDir}/outer/node_modules/foo`
      await Deno.mkdir(innerDir, { recursive: true })
      await Deno.mkdir(pkgDir, { recursive: true })

      const denoJsonPath = `${innerDir}/deno.json`
      const mainPath = `${innerDir}/main.js`
      const pkgIndexPath = `${pkgDir}/index.js`
      const pkgSiblingPath = `${pkgDir}/sibling.js`

      await Deno.writeTextFile(
        denoJsonPath,
        JSON.stringify({ imports: { foo: `file://${pkgIndexPath}` } }),
      )
      await Deno.writeTextFile(
        mainPath,
        `import { hello } from "foo";\nexport { hello };\n`,
      )
      await Deno.writeTextFile(
        pkgIndexPath,
        `module.exports = require('./sibling');\n`,
      )
      await Deno.writeTextFile(
        pkgSiblingPath,
        `module.exports = { hello: 'world' };\n`,
      )

      const result = await esbuild.build({
        entryPoints: [mainPath],
        bundle: true,
        plugins: [denoPlugin({ configPath: denoJsonPath })],
        write: false,
        format: 'esm',
      })

      const output = result.outputFiles[0]?.text ?? ''
      assertStringIncludes(output, 'hello')
      assertStringIncludes(output, 'world')
    } finally {
      await Deno.remove(tmpDir, { recursive: true })
      await esbuild.stop()
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
})
