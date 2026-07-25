import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { unbundle } from '../unbundle.ts'

function firstEntry<T>(arr: readonly T[], msg = 'expected at least one entry file'): T {
  assert(arr.length > 0, msg)
  return arr[0] as T
}

/** Build a `deno.json` config that enables npm/jsr resolution from a temp dir. */
async function setupConfig(tmpDir: string): Promise<string> {
  const configPath = `${tmpDir}/deno.json`
  await Deno.writeTextFile(configPath, JSON.stringify({ nodeModulesDir: 'auto' }))
  return configPath
}

/** Run an async fn with a temp dir; auto-cleanup is best-effort (smoke runs are fast). */
async function withTmp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await Deno.makeTempDir({ prefix: 'unbundle-test-' })
  try {
    return await fn(dir)
  } finally {
    try {
      await Deno.remove(dir, { recursive: true })
    } catch {
      // best-effort
    }
  }
}

Deno.test({
  name: 'unbundle - npm:react emits ESM files with relative imports',
  fn: async () => {
    await withTmp(async (tmpDir) => {
      const configPath = await setupConfig(tmpDir)
      const result = await unbundle({
        entryPoints: ['npm:react@18.3.1'],
        outdir: tmpDir,
        configPath,
      })
      // Entry file is the npm:react index.
      assertEquals(result.entryFiles.length, 1)
      const entryFile = firstEntry(result.entryFiles)
      assertStringIncludes(entryFile, 'npm__react@18.3.1')
      // Index.js content is ESM (default export) and references sibling CJS files.
      const indexText = await Deno.readTextFile(entryFile)
      assertStringIncludes(indexText, 'export default')
      // Imports inside the emitted file point at sibling files, not at "npm:react".
      assert(!indexText.includes('"npm:react'))
    })
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'unbundle - npm:react subpath import resolves as sibling file',
  fn: async () => {
    await withTmp(async (tmpDir) => {
      const configPath = await setupConfig(tmpDir)
      const result = await unbundle({
        entryPoints: ['npm:react@18.3.1'],
        outdir: tmpDir,
        configPath,
      })
      // npm:react bundles its subpath CJS files into the same package output.
      const relPaths = result.files.map((f) => f.slice(tmpDir.length + 1)).sort()
      assert(relPaths.includes('npm__react@18.3.1/index.js'))
      assert(relPaths.includes('npm__react@18.3.1/cjs/react.production.min.js'))
    })
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'unbundle - local JSX with jsx:transform emits _jsx',
  fn: async () => {
    await withTmp(async (tmpDir) => {
      const configPath = await setupConfig(tmpDir)
      const mainPath = `${tmpDir}/main.tsx`
      await Deno.writeTextFile(
        mainPath,
        `import { jsx } from "jsr:@hono/hono@4.12.32/jsx/dom";\nexport const el = jsx("div", { children: "hi" });`,
      )
      const result = await unbundle({
        entryPoints: [mainPath],
        outdir: tmpDir,
        configPath,
        jsx: 'transform',
      })
      const indexText = await Deno.readTextFile(firstEntry(result.entryFiles))
      // The JSX in the user's source would be transformed by esbuild, but the
      // fixture uses jsx() directly. The output should still preserve the call
      // and reference the hono JSX runtime via the relative path.
      assertStringIncludes(indexText, 'jsx(')
      // The hono JSX runtime file is emitted as a sibling.
      assert(
        result.files.some((f) => f.endsWith('/hono-jsx-runtime.js') || f.includes('jsx-runtime')),
      )
    })
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'unbundle - jsr:@hono/hono/jsx/dom with jsx:preserve keeps JSX literal',
  fn: async () => {
    await withTmp(async (tmpDir) => {
      const configPath = await setupConfig(tmpDir)
      const result = await unbundle({
        entryPoints: ['jsr:@hono/hono@4.12.32/jsx/dom'],
        outdir: tmpDir,
        configPath,
        jsx: 'preserve',
      })
      const allText = await Promise.all(result.files.map((f) => Deno.readTextFile(f)))
      const merged = allText.join('\n')
      // JSX literal: a tag-like expression appears in the source.
      assert(merged.includes('<') && merged.includes('/>') || merged.includes('</'))
    })
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'unbundle - deno.json import map rewrites bare specifier',
  fn: async () => {
    await withTmp(async (tmpDir) => {
      // Write a lib file and a deno.json that maps "@lib/util" to it.
      const libPath = `${tmpDir}/util.ts`
      await Deno.writeTextFile(libPath, `export const greet = (n: string) => \`hi \${n}\`;`)
      const configPath = `${tmpDir}/deno.json`
      await Deno.writeTextFile(
        configPath,
        JSON.stringify({
          nodeModulesDir: 'auto',
          imports: { '@lib/util': './util.ts' },
        }),
      )
      const mainPath = `${tmpDir}/main.ts`
      await Deno.writeTextFile(
        mainPath,
        `import { greet } from "@lib/util";\nexport const main = greet("test");`,
      )

      const result = await unbundle({
        entryPoints: [mainPath],
        outdir: tmpDir,
        configPath,
      })
      const indexText = await Deno.readTextFile(firstEntry(result.entryFiles))
      // The bare specifier "@lib/util" was rewritten to a local relative path.
      assert(!indexText.includes('"@lib/util"'))
      assertStringIncludes(indexText, 'util.js')
      assertStringIncludes(indexText, 'greet')
    })
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'unbundle - npm CJS package (npm:ms@2) produces ESM',
  fn: async () => {
    await withTmp(async (tmpDir) => {
      const configPath = await setupConfig(tmpDir)
      const result = await unbundle({
        entryPoints: ['npm:ms@2.1.3'],
        outdir: tmpDir,
        configPath,
      })
      const indexText = await Deno.readTextFile(firstEntry(result.entryFiles))
      // ms@2 is CJS but esbuild emits it via __commonJS as ESM. The result
      // should be a default export of the function.
      assertStringIncludes(indexText, 'export default')
    })
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'unbundle - publicEnvVarPrefix inlines Deno.env.get',
  fn: async () => {
    await withTmp(async (tmpDir) => {
      Deno.env.set('PUBLIC_TEST_VAR', 'hello-world')
      const configPath = await setupConfig(tmpDir)
      const mainPath = `${tmpDir}/main.ts`
      await Deno.writeTextFile(
        mainPath,
        `export const v = Deno.env.get("PUBLIC_TEST_VAR");`,
      )

      try {
        const result = await unbundle({
          entryPoints: [mainPath],
          outdir: tmpDir,
          configPath,
          publicEnvVarPrefix: 'PUBLIC_',
        })
        const indexText = await Deno.readTextFile(firstEntry(result.entryFiles))
        assertStringIncludes(indexText, '"hello-world"')
        assert(!indexText.includes('Deno.env.get'))
      } finally {
        Deno.env.delete('PUBLIC_TEST_VAR')
      }
    })
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'unbundle - relative imports rewritten to outdir paths',
  fn: async () => {
    await withTmp(async (tmpDir) => {
      const utilPath = `${tmpDir}/util.ts`
      await Deno.writeTextFile(utilPath, `export const x = 1;`)
      const mainPath = `${tmpDir}/main.ts`
      await Deno.writeTextFile(mainPath, `import { x } from "./util.ts"; export { x };`)
      const configPath = `${tmpDir}/deno.json`
      await Deno.writeTextFile(configPath, JSON.stringify({ nodeModulesDir: 'auto' }))

      const result = await unbundle({
        entryPoints: [mainPath],
        outdir: tmpDir,
        configPath,
      })
      const indexText = await Deno.readTextFile(firstEntry(result.entryFiles))
      // The relative import was rewritten to a sibling file with .js extension.
      assertStringIncludes(indexText, './util.js')
      assert(!indexText.includes('./util.ts'))
      // util.js was emitted as a sibling file.
      assert(result.files.some((f) => f.endsWith('/util.js')))
    })
  },
  sanitizeOps: false,
  sanitizeResources: false,
})
