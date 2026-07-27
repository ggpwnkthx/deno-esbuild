import { assert, assertEquals } from '@std/assert'
import { isAllowedModuleSpec } from '../src/server/allowlist.ts'

Deno.test('isAllowedModuleSpec accepts allowlisted bare specifiers', () => {
  assert(isAllowedModuleSpec('react'))
  assert(isAllowedModuleSpec('react-dom/client'))
  assert(isAllowedModuleSpec('react/jsx-runtime'))
})

Deno.test('isAllowedModuleSpec rejects specifiers outside the allowlist', () => {
  assertEquals(isAllowedModuleSpec('lodash'), false)
  assertEquals(isAllowedModuleSpec('react-dom/server'), false)
})

Deno.test('isAllowedModuleSpec rejects URL-scheme specifiers', () => {
  assertEquals(isAllowedModuleSpec('npm:react'), false)
  assertEquals(isAllowedModuleSpec('jsr:@std/path'), false)
  assertEquals(isAllowedModuleSpec('https://example.com/mod.js'), false)
})

Deno.test('isAllowedModuleSpec rejects path traversal and empty input', () => {
  assertEquals(isAllowedModuleSpec(''), false)
  assertEquals(isAllowedModuleSpec('../etc/passwd'), false)
  assertEquals(isAllowedModuleSpec('react/../../etc'), false)
})
