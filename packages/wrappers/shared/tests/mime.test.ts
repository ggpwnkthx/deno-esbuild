import { assertEquals } from '@std/assert'
import { DEFAULT_MIME, JS_MIME, mimeFor } from '../mod.ts'

Deno.test('mimeFor - returns the expected MIME for known extensions', () => {
  assertEquals(mimeFor('index.html'), 'text/html; charset=utf-8')
  assertEquals(mimeFor('script.js'), 'application/javascript; charset=utf-8')
  assertEquals(mimeFor('module.mjs'), 'application/javascript; charset=utf-8')
  assertEquals(mimeFor('source.map'), 'application/json; charset=utf-8')
  assertEquals(mimeFor('data.json'), 'application/json; charset=utf-8')
  assertEquals(mimeFor('styles.css'), 'text/css; charset=utf-8')
  assertEquals(mimeFor('icon.svg'), 'image/svg+xml')
  assertEquals(mimeFor('logo.png'), 'image/png')
  assertEquals(mimeFor('favicon.ico'), 'image/x-icon')
})

Deno.test('mimeFor - is case-insensitive on the extension', () => {
  assertEquals(mimeFor('INDEX.HTML'), 'text/html; charset=utf-8')
  assertEquals(mimeFor('Component.TSX'), 'application/octet-stream')
})

Deno.test('mimeFor - returns DEFAULT_MIME for unknown extensions', () => {
  assertEquals(mimeFor('archive.zip'), DEFAULT_MIME)
  assertEquals(mimeFor('no-extension'), DEFAULT_MIME)
  assertEquals(mimeFor(''), DEFAULT_MIME)
})

Deno.test('mimeFor - accepts POSIX and Windows separators', () => {
  assertEquals(mimeFor('src/components/Button.tsx'), 'application/octet-stream')
  assertEquals(mimeFor('src\\components\\Button.tsx'), 'application/octet-stream')
  assertEquals(mimeFor('a/b/c/index.html'), 'text/html; charset=utf-8')
})

Deno.test('mimeFor - ignores dots in the directory portion', () => {
  assertEquals(mimeFor('.gitignore'), DEFAULT_MIME)
  assertEquals(mimeFor('weird.dir.name/file'), DEFAULT_MIME)
  assertEquals(mimeFor('weird.dir.name/file.html'), 'text/html; charset=utf-8')
})

Deno.test('JS_MIME - has the expected value', () => {
  assertEquals(JS_MIME, 'application/javascript; charset=utf-8')
})

Deno.test('DEFAULT_MIME - has the expected value', () => {
  assertEquals(DEFAULT_MIME, 'application/octet-stream')
})
