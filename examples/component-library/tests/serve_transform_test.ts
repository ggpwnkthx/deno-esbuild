import { assertEquals, assertStringIncludes } from '@std/assert'
import { clearTransformCache, failureBody, transformLocal } from '../src/server/serve_transform.ts'
import { DENO_CONFIG, joinSrc } from '../src/server/paths.ts'

// Mirror the production resolver: derive the allowlist from this example's
// deno.json imports and resolve each spec to its `/@modules/<spec>` URL.
const denoConfig = JSON.parse(await Deno.readTextFile(DENO_CONFIG)) as {
  imports?: Record<string, string>
}
const allowedSpecs = new Set(Object.keys(denoConfig.imports ?? {}))
const testResolver = (spec: string): string | undefined =>
  allowedSpecs.has(spec) ? `/@modules/${spec}` : undefined

Deno.test('transformLocal returns transformed ESM for a valid file', async () => {
  const abs = joinSrc('main.tsx')
  const { code } = await transformLocal(abs, 'src/main.tsx', testResolver)
  assertStringIncludes(code, 'createRoot')
  assertStringIncludes(code, '"/@modules/react/jsx-runtime"')
  assertStringIncludes(code, '"/@modules/react-dom/client"')
  assertStringIncludes(code, '"/@modules/@mui/material/Button"')
})

Deno.test('transformLocal caches transformed output until source mtime changes', async () => {
  const abs = joinSrc('main.tsx')
  const first = await transformLocal(abs, 'src/main.tsx', testResolver)
  const second = await transformLocal(abs, 'src/main.tsx', testResolver)
  assertEquals(first.code, second.code, 'cache must return identical code for unchanged mtime')
})

Deno.test('transformLocal re-transforms after the source mtime changes', async () => {
  const dir = await Deno.makeTempDir()
  try {
    const abs = `${dir}/mtime.tsx`
    await Deno.writeTextFile(abs, 'export const v: number = 1;\n')
    const rel = 'mtime.tsx'

    const first = await transformLocal(abs, rel, testResolver)
    assertStringIncludes(first.code, '1')

    const future = new Date(Date.now() + 5_000)
    await Deno.utime(abs, future, future)

    const second = await transformLocal(abs, rel, testResolver)
    assertEquals(first.code, second.code, 'mtime change must trigger re-transform')

    await Deno.writeTextFile(abs, 'export const v: number = 2;\n')
    const later = new Date(Date.now() + 10_000)
    await Deno.utime(abs, later, later)
    const third = await transformLocal(abs, rel, testResolver)
    assertStringIncludes(third.code, '2', 'post-edit transform must reflect new source')
    assertEquals(third.code === first.code, false, 'edited source must not return cached code')
  } finally {
    await Deno.remove(dir, { recursive: true })
    clearTransformCache()
  }
})

Deno.test('failureBody emits a module body that throws with the error message', () => {
  const body = failureBody('src/x.ts', new Error('boom'))
  assertStringIncludes(body, 'throw new Error')
  assertStringIncludes(body, 'transform failed for src/x.ts: boom')
})
