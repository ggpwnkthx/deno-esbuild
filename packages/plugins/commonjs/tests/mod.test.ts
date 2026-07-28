import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import * as esbuild from 'esbuild'
import commonjsPlugin from '../mod.ts'

async function bundleWithPlugin(
  entry: string,
): Promise<{ code: string; warnings: unknown[] }> {
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    plugins: [commonjsPlugin()],
  })
  return {
    code: result.outputFiles?.[0]?.text ?? '',
    warnings: result.warnings as unknown[],
  }
}

Deno.test('plugin — wraps `module.exports = …` in an IIFE with a default export', async () => {
  const { code } = await bundleWithPlugin(
    new URL('./fixtures/cjs-module-exports.js', import.meta.url).pathname,
  )
  // The CJS file is wrapped in esbuild's `__commonJS` IIFE and its
  // `module.exports` value is surfaced as a default ESM export. The
  // exact form is `export { foo_default as default }` because esbuild
  // gives the inner IIFE's `module.exports` an auto-generated name.
  assert(
    /export\s*\{[^}]*as default[^}]*\}/.test(code),
    `expected an \`export { … as default }\` in the output, got:\n${code}`,
  )
})

Deno.test('plugin — converts top-level `require()` calls to ESM `import`', async () => {
  // The plugin's main value-add: a top-level `require("dep")` call
  // is rewritten into `import dep from "dep"`, which esbuild then
  // keeps as an external static import. Without the plugin, esbuild
  // would wrap the file in `__commonJS` and leave `require("dep")`
  // as a `__require2("dep")` call that throws `Dynamic require of
  // "dep" is not supported` for external specs.
  const entry = new URL(
    './fixtures/cjs-require.js',
    import.meta.url,
  ).pathname
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    external: ['dep'],
    plugins: [commonjsPlugin()],
  })
  const code = result.outputFiles?.[0]?.text ?? ''
  assert(
    /import\s+dep\s+from\s+["']dep["']/.test(code),
    `expected the top-level \`require("dep")\` to be converted into a static \`import dep from "dep"\`, got:\n${code}`,
  )
  assert(
    !/__require2?\s*\(\s*["']dep["']\s*\)/.test(code),
    `expected no \`__require("dep")\` call to survive the plugin's transform, got:\n${code}`,
  )
})

Deno.test('plugin — leaves ESM files alone', async () => {
  const { code } = await bundleWithPlugin(
    new URL('./fixtures/esm-basic.js', import.meta.url).pathname,
  )
  // ESM source has its own `export` statements; the plugin must not
  // transform them further.
  assertStringIncludes(code, 'export')
  // The ESM source is short — the bundled output should not have grown
  // by a factor of 10x from a `module.exports = X` rewrite.
  assert(
    code.length < 1024,
    `output for a tiny ESM file is suspiciously large (${code.length} bytes); did the plugin's onLoad run on this file?`,
  )
})

Deno.test("plugin — skips the transform when format isn't 'esm'", async () => {
  // For `format: 'iife'`, the plugin's setup short-circuits and returns
  // without registering the onLoad. esbuild's own CJS handling kicks
  // in (the right thing for IIFE bundles). We just verify that the
  // bundle still produces some output and the plugin doesn't crash.
  const entry = new URL(
    './fixtures/cjs-module-exports.js',
    import.meta.url,
  ).pathname
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    plugins: [commonjsPlugin()],
  })
  assertEquals(result.errors.length, 0)
  assert(result.outputFiles?.[0]?.text)
})

Deno.test('plugin — filter option restricts which files are transformed', async () => {
  // The plugin only transforms files whose path matches one of the
  // filter regexes. With a filter that matches *no* file, both
  // fixtures get loaded via esbuild's default CJS handler — the
  // result is a bundle where both source files are wrapped in
  // `__commonJS` IIFEs (no transformation was applied by the
  // plugin). The point of this test is the *contrast* with the
  // "wraps `module.exports`" test above: with a matching filter
  // the plugin's esbuild-based transform runs, with a non-matching
  // filter esbuild's default CJS handler runs.
  const cjsA = new URL(
    './fixtures/cjs-module-exports.js',
    import.meta.url,
  ).pathname
  const cjsB = new URL(
    './fixtures/cjs-require.js',
    import.meta.url,
  ).pathname
  const result = await esbuild.build({
    stdin: {
      contents: `import a from ${JSON.stringify(cjsA)}; import b from ${
        JSON.stringify(cjsB)
      }; export default { a, b };`,
      resolveDir: '/',
      sourcefile: 'entry.js',
      loader: 'js',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    external: ['dep'],
    plugins: [commonjsPlugin({ filter: [/no-match-please/] })],
  })
  const code = result.outputFiles?.[0]?.text ?? ''

  // Neither fixture matched the filter, so both were loaded by
  // esbuild's default CJS handler (the plugin returned `null` for
  // both). The bundle should still contain `module.exports = …` in
  // both wrappers — that's the "no transform happened" signal.
  assert(
    /\bmodule\.exports\b/.test(code),
    `expected the bundle to still contain \`module.exports\` when the filter matches nothing (the plugin should have returned null and esbuild's default CJS handler should have wrapped the file), got:\n${code}`,
  )
})
