import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { rewriteImports, type RewriteOptions } from '../mod.ts'

const ALLOWLIST: RewriteOptions['resolveBareSpecifier'] = (spec) => {
  const map: Record<string, string> = {
    'react': '/@modules/react',
    'react-dom': '/@modules/react-dom',
    'react-dom/client': '/@modules/react-dom/client',
    'react/jsx-runtime': '/@modules/react/jsx-runtime',
    'react/jsx-dev-runtime': '/@modules/react/jsx-dev-runtime',
    '@mui/material': '/@modules/@mui/material',
    '@emotion/react': '/@modules/@emotion/react',
  }
  return map[spec]
}

Deno.test('rewriteImports - rewrites react/jsx-runtime to /@modules URL', async () => {
  const source = `import { jsx as _jsx } from "react/jsx-runtime";\nexport const x = 1;\n`
  const out = await rewriteImports(source, {
    specifier: 'main.tsx',
    defaultJsxImportSource: 'react',
    resolveBareSpecifier: ALLOWLIST,
  })
  assertStringIncludes(out, `from "/@modules/react/jsx-runtime"`)
  assert(!out.includes('from "react/jsx-runtime"'), `expected source to be rewritten, got: ${out}`)
})

Deno.test('rewriteImports - rewrites react-dom/client to /@modules URL', async () => {
  const source = `import { createRoot } from "react-dom/client";\n`
  const out = await rewriteImports(source, {
    specifier: 'main.tsx',
    defaultJsxImportSource: 'react',
    resolveBareSpecifier: ALLOWLIST,
  })
  assertStringIncludes(out, `from "/@modules/react-dom/client"`)
})

Deno.test('rewriteImports - rewrites react and react-dom bare specifiers', async () => {
  const source = `import * as React from "react";\nimport * as ReactDOM from "react-dom";\n`
  const out = await rewriteImports(source, {
    specifier: 'main.tsx',
    defaultJsxImportSource: 'react',
    resolveBareSpecifier: ALLOWLIST,
  })
  assertStringIncludes(out, `from "/@modules/react"`)
  assertStringIncludes(out, `from "/@modules/react-dom"`)
})

Deno.test('rewriteImports - rewrites dynamic import(spec) calls', async () => {
  const source = `async function f() { return await import('react-dom/client'); }\n`
  const out = await rewriteImports(source, {
    specifier: 'main.tsx',
    defaultJsxImportSource: 'react',
    resolveBareSpecifier: ALLOWLIST,
  })
  assertStringIncludes(out, `import('/@modules/react-dom/client')`)
})

Deno.test('rewriteImports - preserves the literal text inside template literals', async () => {
  const source = `const hint = "use react/jsx-runtime";\nconst tpl = \`see "react/jsx-runtime"\`;\n`
  const out = await rewriteImports(source, {
    specifier: 'main.tsx',
    defaultJsxImportSource: 'react',
    resolveBareSpecifier: ALLOWLIST,
  })
  assertStringIncludes(out, `const hint = "use react/jsx-runtime"`)
  assertStringIncludes(out, `\`see "react/jsx-runtime"\``)
})

Deno.test('rewriteImports - leaves relative imports untouched', async () => {
  const source = `import { x } from "./Button.tsx";\nimport { y } from "../shared/util.ts";\n`
  const out = await rewriteImports(source, {
    specifier: 'main.tsx',
    defaultJsxImportSource: 'react',
    resolveBareSpecifier: ALLOWLIST,
  })
  assertEquals(out, source)
})

Deno.test('rewriteImports - throws on a non-allowlisted bare specifier', async () => {
  const source = `import _ from "lodash";\n`
  let caught: unknown
  try {
    await rewriteImports(source, {
      specifier: 'main.tsx',
      defaultJsxImportSource: 'react',
      resolveBareSpecifier: ALLOWLIST,
    })
  } catch (err) {
    caught = err
  }
  assert(caught instanceof Error)
  assertStringIncludes((caught as Error).message, 'lodash')
})

Deno.test('rewriteImports - leaves URL-scheme specifiers untouched', async () => {
  const source = `import * as esm from "npm:react";\nimport * as jsr from "jsr:@std/path";\n`
  const out = await rewriteImports(source, {
    specifier: 'main.tsx',
    defaultJsxImportSource: 'react',
    resolveBareSpecifier: ALLOWLIST,
  })
  assertEquals(out, source)
})

Deno.test('rewriteImports - rewrites scoped bare specifiers (e.g. @mui/material)', async () => {
  const source =
    `import { Button, Card } from "@mui/material";\nimport { css } from "@emotion/react";\n`
  const out = await rewriteImports(source, {
    specifier: 'main.tsx',
    defaultJsxImportSource: 'react',
    resolveBareSpecifier: ALLOWLIST,
  })
  assertStringIncludes(out, `from "/@modules/@mui/material"`)
  assertStringIncludes(out, `from "/@modules/@emotion/react"`)
  assert(!out.includes('from "@mui/material"'), `expected source to be rewritten, got: ${out}`)
  assert(!out.includes('from "@emotion/react"'), `expected source to be rewritten, got: ${out}`)
})

Deno.test('rewriteImports - normalises non-TS/JSX specifier to .js for parseModule', async () => {
  const source = `import * as React from "react";\nimport { jsx } from "react/jsx-runtime";\n`
  const out = await rewriteImports(source, {
    specifier: 'react',
    defaultJsxImportSource: 'react',
    resolveBareSpecifier: ALLOWLIST,
  })
  assertStringIncludes(out, `from "/@modules/react"`)
  assertStringIncludes(out, `from "/@modules/react/jsx-runtime"`)
  assert(!out.includes('from "react"'), `expected react specifier rewritten, got: ${out}`)
})

Deno.test('rewriteImports - normalises scoped npm specifier (no extension) to .js', async () => {
  const source = `import { Button } from "@mui/material";\n`
  const out = await rewriteImports(source, {
    specifier: '@mui/material',
    defaultJsxImportSource: 'react',
    resolveBareSpecifier: ALLOWLIST,
  })
  assertStringIncludes(out, `from "/@modules/@mui/material"`)
  assert(!out.includes('from "@mui/material"'), `expected @mui/material rewritten, got: ${out}`)
})

Deno.test('rewriteImports - returns empty string for empty input', async () => {
  const out = await rewriteImports('', {
    specifier: 'main.tsx',
    defaultJsxImportSource: 'react',
    resolveBareSpecifier: ALLOWLIST,
  })
  assertEquals(out, '')
})

Deno.test('rewriteImports - returns source unchanged when no allowlisted specs appear', async () => {
  const source = `const x = 1;\nexport { x };\n`
  const out = await rewriteImports(source, {
    specifier: 'main.tsx',
    defaultJsxImportSource: 'react',
    resolveBareSpecifier: ALLOWLIST,
  })
  assertEquals(out, source)
})

Deno.test('rewriteImports - failAsErrorBody returns throw body instead of throwing', async () => {
  const source = `import _ from "lodash";\n`
  const out = await rewriteImports(source, {
    specifier: 'main.tsx',
    defaultJsxImportSource: 'react',
    resolveBareSpecifier: ALLOWLIST,
    failAsErrorBody: true,
  })
  assertStringIncludes(out, `throw new Error(`)
  assertStringIncludes(out, `rewrite failed for main.tsx`)
  assertStringIncludes(out, `lodash`)
})

Deno.test('rewriteImports - failAsErrorBody uses specifier in the throw body', async () => {
  const source = `import _ from "lodash";\n`
  const out = await rewriteImports(source, {
    specifier: 'src/components/Broken.tsx',
    defaultJsxImportSource: 'react',
    resolveBareSpecifier: ALLOWLIST,
    failAsErrorBody: true,
  })
  assertStringIncludes(out, `throw new Error(`)
  assertStringIncludes(out, `rewrite failed for src/components/Broken.tsx`)
  assertStringIncludes(out, `lodash`)
})

Deno.test('rewriteImports - failAsErrorBody uses <rewriter-input> when no specifier provided', async () => {
  const source = `import _ from "lodash";\n`
  const out = await rewriteImports(source, {
    defaultJsxImportSource: 'react',
    resolveBareSpecifier: ALLOWLIST,
    failAsErrorBody: true,
  })
  assertStringIncludes(out, `rewrite failed for <rewriter-input>`)
})

Deno.test('rewriteImports - failAsErrorBody returns source unchanged when no error occurs', async () => {
  const source = `import * as React from "react";\n`
  const out = await rewriteImports(source, {
    specifier: 'main.tsx',
    defaultJsxImportSource: 'react',
    resolveBareSpecifier: ALLOWLIST,
    failAsErrorBody: true,
  })
  assertStringIncludes(out, `from "/@modules/react"`)
  assert(!out.includes('throw new Error('), 'expected successful rewrite, got throw body')
})
