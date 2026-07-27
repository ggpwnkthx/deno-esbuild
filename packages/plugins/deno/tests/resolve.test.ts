import { assertEquals } from '@std/assert'
import * as path from '@std/path'
import { resolveImporter } from '../resolve.ts'

Deno.test({
  name: 'resolveImporter - returns importer unchanged when no workspaceRoot',
  fn() {
    const importer = 'file:///some/other/path/main.ts'
    assertEquals(resolveImporter(importer, undefined), importer)
    assertEquals(resolveImporter(undefined, undefined), undefined)
  },
})

Deno.test({
  name: 'resolveImporter - substitutes synthetic referrer for entry point',
  fn() {
    const wsRoot = path.resolve('/workspace')
    const out = resolveImporter(undefined, wsRoot)
    assertEquals(out, path.toFileUrl(path.join(wsRoot, '.deno-resolver-referrer')).toString())
  },
})

Deno.test({
  name: 'resolveImporter - keeps remote URLs unchanged',
  fn() {
    const wsRoot = path.resolve('/workspace')
    for (
      const importer of [
        'https://example.com/mod.ts',
        'http://example.com/mod.ts',
        'npm:react@18.2.0',
        'jsr:@hono/hono@4',
      ]
    ) {
      assertEquals(resolveImporter(importer, wsRoot), importer)
    }
  },
})

Deno.test({
  name: 'resolveImporter - keeps importers inside workspace unchanged',
  fn() {
    const wsRoot = path.resolve('/workspace')
    const inside = path.toFileUrl(path.join(wsRoot, 'src/main.ts')).toString()
    assertEquals(resolveImporter(inside, wsRoot), inside)
  },
})

Deno.test({
  name: 'resolveImporter - substitutes synthetic referrer for outside-workspace local importer',
  fn() {
    const wsRoot = path.resolve('/workspace')
    const outside = path.toFileUrl('/other/place/main.ts').toString()
    assertEquals(
      resolveImporter(outside, wsRoot),
      path.toFileUrl(path.join(wsRoot, '.deno-resolver-referrer')).toString(),
    )
  },
})

Deno.test({
  name: 'resolveImporter - passes through managed package locations',
  fn() {
    const wsRoot = path.resolve('/workspace')
    const inNodeModules = path.toFileUrl(
      '/proj/node_modules/.deno/foo@1.0.0/node_modules/foo/main.js',
    )
      .toString()
    assertEquals(resolveImporter(inNodeModules, wsRoot), inNodeModules)
    const inDenoCache = path.toFileUrl('/home/.cache/deno/deps/foo/mod.ts').toString()
    assertEquals(resolveImporter(inDenoCache, wsRoot), inDenoCache)
  },
})

Deno.test({
  name: 'resolveImporter - handles bare absolute path importer',
  fn() {
    const wsRoot = path.resolve('/workspace')
    const outside = '/other/place/main.ts'
    assertEquals(
      resolveImporter(outside, wsRoot),
      path.toFileUrl(path.join(wsRoot, '.deno-resolver-referrer')).toString(),
    )
  },
})
