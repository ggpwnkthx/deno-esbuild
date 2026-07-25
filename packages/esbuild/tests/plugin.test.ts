import { assert, assertEquals, assertRejects, assertStringIncludes } from '@std/assert'
import * as esbuild from '../mod.ts'
import type { Plugin } from '../mod.ts'

// Each plugin test wraps a build call in a try/finally that calls stop()
// so the native child process is always torn down — Deno's test runner
// reports a failure when a child process is left running after a test.

Deno.test('plugin: onResolve + onLoad inject a virtual module', async () => {
  try {
    const plugin: Plugin = {
      name: 'inject',
      setup(build) {
        // Match the import path, route it into a custom namespace, then
        // let onLoad serve the contents. (Registering only onLoad does
        // not work — esbuild runs the resolver first.)
        build.onResolve({ filter: /^inject:/ }, () => ({
          path: 'inject:virtual',
          namespace: 'inject-ns',
        }))
        build.onLoad({ filter: /.*/, namespace: 'inject-ns' }, () => ({
          contents: 'export const fromPlugin = 42;',
          loader: 'ts',
        }))
      },
    }
    const result = await esbuild.build({
      stdin: {
        contents: 'export { fromPlugin } from "inject:virtual";',
        loader: 'ts',
        sourcefile: 'entry.ts',
        resolveDir: Deno.cwd(),
      },
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      write: false,
      plugins: [plugin],
    })
    assertEquals(result.errors.length, 0)
    const out = result.outputFiles?.[0]?.text ?? ''
    assertStringIncludes(out, 'fromPlugin')
    assertEquals(out.includes(': number'), false)
  } finally {
    await esbuild.stop()
  }
})

Deno.test('plugin: onResolve reroutes a path into a custom namespace, onLoad sees the new path', async () => {
  try {
    let loadSawPath = ''
    let loadSawNamespace = ''
    const plugin: Plugin = {
      name: 'redirect',
      setup(build) {
        build.onResolve({ filter: /^virtual$/ }, () => ({
          path: 'redirected.ts',
          namespace: 'redirected-ns',
        }))
        build.onLoad(
          { filter: /.*/, namespace: 'redirected-ns' },
          (args) => {
            loadSawPath = args.path
            loadSawNamespace = args.namespace
            return { contents: 'export const r = 1;', loader: 'ts' }
          },
        )
      },
    }
    const result = await esbuild.build({
      stdin: {
        contents: 'export { r } from "virtual";',
        loader: 'ts',
        sourcefile: 'entry.ts',
        resolveDir: Deno.cwd(),
      },
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      write: false,
      plugins: [plugin],
    })
    assertEquals(result.errors.length, 0)
    assertEquals(loadSawPath, 'redirected.ts')
    assertEquals(loadSawNamespace, 'redirected-ns')
  } finally {
    await esbuild.stop()
  }
})

Deno.test('plugin: pluginData round-trips from onResolve to onLoad', async () => {
  try {
    let observedData: unknown = undefined
    const plugin: Plugin = {
      name: 'pluginData',
      setup(build) {
        build.onResolve({ filter: /^tagged$/ }, () => ({
          path: 'tagged',
          namespace: 'pluginData-ns',
          pluginData: { kind: 'tagged', value: 7 },
        }))
        build.onLoad({ filter: /.*/, namespace: 'pluginData-ns' }, (args) => {
          observedData = args.pluginData
          return { contents: 'export const k = 1;', loader: 'ts' }
        })
      },
    }
    const result = await esbuild.build({
      stdin: {
        contents: 'export { k } from "tagged";',
        loader: 'ts',
        sourcefile: 'entry.ts',
        resolveDir: Deno.cwd(),
      },
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      write: false,
      plugins: [plugin],
    })
    assertEquals(result.errors.length, 0)
    assertEquals(observedData, { kind: 'tagged', value: 7 })
  } finally {
    await esbuild.stop()
  }
})

Deno.test('plugin: setup receives the original build options as `initialOptions`', async () => {
  try {
    let seen: unknown
    const marker = '__marker_' + crypto.randomUUID() + '__'
    const plugin: Plugin = {
      name: 'capture',
      setup(build) {
        seen = build.initialOptions
        build.onLoad({ filter: /.*/, namespace: 'file' }, () => ({
          contents: 'export const x = "marker";',
          loader: 'ts',
        }))
      },
    }
    const options = {
      stdin: {
        contents: 'export const x = 1;',
        loader: 'ts' as const,
        sourcefile: 'entry.ts',
        resolveDir: Deno.cwd(),
      },
      bundle: true,
      format: 'esm' as const,
      platform: 'neutral' as const,
      write: false,
      plugins: [plugin],
      banner: { js: marker },
    }
    const result = await esbuild.build(options)
    assertEquals(result.errors.length, 0)
    const init = seen as { banner?: { js?: string } }
    assertEquals(init.banner?.js, marker)
  } finally {
    await esbuild.stop()
  }
})

Deno.test('plugin: onResolve returning `errors` rejects the build with the plugin error message', async () => {
  try {
    // When a plugin returns `errors: [...]`, esbuild treats them as build
    // errors and rejects the build promise with the formatted error
    // message naming the plugin. (Before this test was added, the strict
    // whitelist rejected `errors` itself as an "Invalid option" from the
    // plugin; this test catches that regression.)
    const plugin: Plugin = {
      name: 'fail',
      setup(build) {
        build.onResolve({ filter: /^forbidden$/ }, () => ({
          errors: [{ text: 'this module is forbidden by policy' }],
        }))
      },
    }
    let rejectionMessage = ''
    try {
      await esbuild.build({
        stdin: {
          contents: 'export { x } from "forbidden";',
          loader: 'ts',
          sourcefile: 'a.ts',
          resolveDir: Deno.cwd(),
        },
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        write: false,
        plugins: [plugin],
      })
    } catch (e) {
      rejectionMessage = (e as Error).message
    }
    assert(rejectionMessage.length > 0, 'expected esbuild.build to reject')
    assertStringIncludes(
      rejectionMessage,
      'this module is forbidden by policy',
    )
  } finally {
    await esbuild.stop()
  }
})

Deno.test('plugin: a throwing onResolve callback rejects the build with the throw message', async () => {
  try {
    // A throwing callback is captured by the transport and surfaced as a
    // `BuildFailure` whose `.message` mentions the throw and the plugin.
    const plugin: Plugin = {
      name: 'thrower',
      setup(build) {
        build.onResolve({ filter: /^boom$/ }, () => {
          throw new Error('boom from onResolve')
        })
      },
    }
    let rejectionMessage = ''
    try {
      await esbuild.build({
        stdin: {
          contents: 'export { x } from "boom";',
          loader: 'ts',
          sourcefile: 'a.ts',
          resolveDir: Deno.cwd(),
        },
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        write: false,
        plugins: [plugin],
      })
    } catch (e) {
      rejectionMessage = (e as Error).message
    }
    assert(rejectionMessage.length > 0, 'expected esbuild.build to reject')
    assertStringIncludes(rejectionMessage, 'boom from onResolve')
  } finally {
    await esbuild.stop()
  }
})

Deno.test('plugin: a plugin without `name` causes the build to reject', async () => {
  try {
    // Missing plugin name is host-side validation that rejects the build
    // promise — callers can't catch the error via result.errors.
    // deno-lint-ignore no-explicit-any
    const badPlugin: any = { setup: () => {} }
    await assertRejects(
      () =>
        esbuild.build({
          stdin: {
            contents: 'export const x = 1;',
            loader: 'ts',
            sourcefile: 'a.ts',
            resolveDir: Deno.cwd(),
          },
          bundle: true,
          format: 'esm',
          platform: 'neutral',
          write: false,
          plugins: [badPlugin],
        }),
      Error,
      'name',
    )
  } finally {
    await esbuild.stop()
  }
})

Deno.test('plugin: setup can use `resolve()` to perform a child resolve from inside a plugin', async () => {
  try {
    // Lay down a real file so the child resolve succeeds. esbuild's
    // `build.resolve()` runs the standard resolver against `resolveDir`,
    // which only finds paths that exist on disk.
    const tmp = await Deno.makeTempDir({ prefix: 'plugin-resolve-' })
    const subPath = `${tmp}/submodule.ts`
    await Deno.writeTextFile(subPath, 'export const r = 1;')

    const plugin: Plugin = {
      name: 'relay',
      setup(build) {
        build.onResolve({ filter: /^relay$/ }, async (args) => {
          const r = await build.resolve('./submodule', {
            resolveDir: args.resolveDir,
            kind: 'import-statement',
          })
          // `r.path` should be absolute (tmp + basename).
          return { path: r.path, namespace: 'file' }
        })
      },
    }
    const result = await esbuild.build({
      stdin: {
        contents: 'export { r } from "relay";',
        loader: 'ts',
        sourcefile: 'entry.ts',
        resolveDir: tmp,
      },
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      write: false,
      plugins: [plugin],
    })

    try {
      assertEquals(result.errors.length, 0)
      const out = result.outputFiles?.[0]?.text ?? ''
      assertStringIncludes(out, 'r')
      assertEquals(out.includes(': number'), false)
    } finally {
      await Deno.remove(tmp, { recursive: true })
    }
  } finally {
    await esbuild.stop()
  }
})

Deno.test('plugin: onDispose callbacks fire after a build (via context)', async () => {
  try {
    // `onDispose` is registered during plugin `setup` and fires after the
    // build completes. Drive it through a context lifecycle.
    let disposeCalled = false
    const plugin: Plugin = {
      name: 'disposing',
      setup(build) {
        build.onDispose(() => {
          disposeCalled = true
        })
      },
    }
    const ctx = await esbuild.context({
      stdin: {
        contents: 'export const x = 1;',
        loader: 'ts',
        sourcefile: 'a.ts',
        resolveDir: Deno.cwd(),
      },
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      write: false,
      plugins: [plugin],
    })
    try {
      await ctx.rebuild()
    } finally {
      await ctx.dispose()
    }
    // Give the deferred `setTimeout(0)` a tick to run.
    await new Promise((r) => setTimeout(r, 5))
    assertEquals(disposeCalled, true)
  } finally {
    await esbuild.stop()
  }
})
