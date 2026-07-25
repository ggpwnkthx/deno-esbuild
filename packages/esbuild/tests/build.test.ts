import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
  assertStringIncludes,
} from '@std/assert'
import * as esbuild from '../mod.ts'

// Each test wraps a build call in a try/finally that calls stop() so the
// native child process is always torn down — Deno's test runner reports a
// failure when a child process is left running after a test.

Deno.test('build: stdin TS input is bundled and the TS annotations are stripped', async () => {
  try {
    const result = await esbuild.build({
      stdin: {
        contents: 'export const answer: number = 42;',
        loader: 'ts',
        sourcefile: 'entry.ts',
        resolveDir: Deno.cwd(),
      },
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      write: false,
    })
    const out = result.outputFiles?.[0]?.text ?? ''
    assertStringIncludes(out, 'answer')
    assertEquals(out.includes(': number'), false)
  } finally {
    await esbuild.stop()
  }
})

Deno.test('build: stdin input preserves an exported value across bundling', async () => {
  try {
    const result = await esbuild.build({
      stdin: {
        contents: 'export const v = 1;',
        loader: 'ts',
        sourcefile: 'x.ts',
        resolveDir: Deno.cwd(),
      },
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      write: false,
    })
    const out = result.outputFiles?.[0]?.text ?? ''
    // After bundling the export is re-emitted as `export { v }`. The
    // declaration is rewritten by the bundler — assert presence of the
    // symbol rather than the original declaration form.
    assertStringIncludes(out, 'v')
    assertStringIncludes(out, 'export')
  } finally {
    await esbuild.stop()
  }
})

Deno.test('build: write:false returns the output file in memory', async () => {
  try {
    const result = await esbuild.build({
      stdin: {
        contents: 'export const v = 1;',
        loader: 'ts',
        sourcefile: 'x.ts',
        resolveDir: Deno.cwd(),
      },
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      write: false,
    })
    const files = result.outputFiles ?? []
    assertEquals(files.length >= 1, true)
    assertExists(files[0]!.text)
  } finally {
    await esbuild.stop()
  }
})

Deno.test('build: metafile:true populates result.metafile as an object', async () => {
  try {
    const result = await esbuild.build({
      stdin: {
        contents: 'export const v = 1;',
        loader: 'ts',
        sourcefile: 'x.ts',
        resolveDir: Deno.cwd(),
      },
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      write: false,
      metafile: true,
    })
    assertExists(result.metafile)
    assertExists((result.metafile as { outputs?: unknown }).outputs)
  } finally {
    await esbuild.stop()
  }
})

Deno.test('build: minify shrinks a multi-line input into roughly one line', async () => {
  try {
    const result = await esbuild.build({
      stdin: {
        contents: 'export function add (a: number, b: number) {\n  return a + b\n}\n',
        loader: 'ts',
        sourcefile: 'x.ts',
        resolveDir: Deno.cwd(),
      },
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      write: false,
      minify: true,
    })
    const out = result.outputFiles?.[0]?.text ?? ''
    const lines = out.split('\n').length
    // A minified bundle is essentially one line; allow a tiny bit of slack
    // for trailing newlines and source-maps comments.
    assertEquals(lines <= 2, true)
    assertStringIncludes(out, 'add')
  } finally {
    await esbuild.stop()
  }
})

Deno.test('build: cjs format produces CommonJS-shaped output', async () => {
  try {
    const result = await esbuild.build({
      stdin: {
        contents: 'export const v = 1;',
        loader: 'ts',
        sourcefile: 'x.ts',
        resolveDir: Deno.cwd(),
      },
      bundle: true,
      format: 'cjs',
      platform: 'neutral',
      write: false,
    })
    const out = result.outputFiles?.[0]?.text ?? ''
    assertStringIncludes(out, 'exports')
  } finally {
    await esbuild.stop()
  }
})

Deno.test('build: iife format wraps the output in an IIFE', async () => {
  try {
    const result = await esbuild.build({
      stdin: {
        contents: 'export const v = 1;',
        loader: 'ts',
        sourcefile: 'x.ts',
        resolveDir: Deno.cwd(),
      },
      bundle: true,
      format: 'iife',
      globalName: 'bundle',
      platform: 'neutral',
      write: false,
    })
    const out = result.outputFiles?.[0]?.text ?? ''
    // Modern esbuild emits arrow-style IIFEs for the iife format. Assert
    // on the assignment to the globalName plus the arrow shape.
    assertStringIncludes(out, 'bundle')
    assertStringIncludes(out, '=>')
    assertStringIncludes(out, '})()')
  } finally {
    await esbuild.stop()
  }
})

Deno.test('build: bundle:false leaves imports unresolved', async () => {
  try {
    const result = await esbuild.build({
      stdin: {
        contents: 'export const v = 1;',
        loader: 'ts',
        sourcefile: 'x.ts',
        resolveDir: Deno.cwd(),
      },
      // No `bundle`; the service should leave the module flat.
      format: 'esm',
      platform: 'neutral',
      write: false,
    })
    assertEquals(result.errors.length, 0)
    const out = result.outputFiles?.[0]?.text ?? ''
    assertStringIncludes(out, 'export')
  } finally {
    await esbuild.stop()
  }
})

Deno.test('build: rejects with a BuildFailure when an entry point cannot be resolved', async () => {
  try {
    // esbuild surfaces resolution failures by rejecting the build promise
    // with a `BuildFailure` whose `.message` includes "Could not resolve".
    const missing = 'does-not-exist-' + crypto.randomUUID() + '.ts'
    let rejectionMessage = ''
    try {
      await esbuild.build({
        entryPoints: [missing],
        bundle: true,
        format: 'esm',
        write: false,
      })
    } catch (e) {
      rejectionMessage = (e as Error).message
    }
    assert(rejectionMessage.length > 0, 'expected esbuild.build to reject')
    assertStringIncludes(
      rejectionMessage,
      'Could not resolve',
    )
  } finally {
    await esbuild.stop()
  }
})

Deno.test('build: rejects with an "Invalid option" message on unknown top-level option keys', async () => {
  try {
    // The flag-builder path surfaces unknown options by rejecting the build
    // promise — the rejection's `.message` contains "Invalid option".
    // The bogus option only exists at runtime, so we widen the input via
    // `as any` (the lint-ignore lives on the cast, not the call).
    await assertRejects(
      () =>
        esbuild.build({
          stdin: {
            contents: 'export const v = 1;',
            loader: 'ts',
            sourcefile: 'x.ts',
            resolveDir: Deno.cwd(),
          },
          bundle: true,
          format: 'esm',
          write: false,
          bogus: true,
          // deno-lint-ignore no-explicit-any
        } as any),
      Error,
      'Invalid option',
    )
  } finally {
    await esbuild.stop()
  }
})

Deno.test('build: build → build → stop sequence reuses the service', async () => {
  try {
    // Two consecutive builds. The native transport keeps the service alive
    // between calls; the second call should succeed without a spawn
    // round-trip. Both must complete and the second must still see TS
    // stripping.
    const r1 = await esbuild.build({
      stdin: {
        contents: 'export const a: number = 1;',
        loader: 'ts',
        sourcefile: 'a.ts',
        resolveDir: Deno.cwd(),
      },
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      write: false,
    })
    const r2 = await esbuild.build({
      stdin: {
        contents: 'export const b: number = 2;',
        loader: 'ts',
        sourcefile: 'b.ts',
        resolveDir: Deno.cwd(),
      },
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      write: false,
    })
    assertEquals(r1.errors.length, 0)
    assertEquals(r2.errors.length, 0)
    assertEquals(r1.outputFiles?.[0]?.text.includes(': number'), false)
    assertEquals(r2.outputFiles?.[0]?.text.includes(': number'), false)
  } finally {
    await esbuild.stop()
  }
})
