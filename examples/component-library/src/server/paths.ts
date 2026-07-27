import * as path from '@std/path'

const HERE = path.dirname(path.fromFileUrl(import.meta.url))

export const EXAMPLE_ROOT = path.resolve(HERE, '..', '..')
export const SRC = path.join(EXAMPLE_ROOT, 'src')
export const TESTS = path.join(EXAMPLE_ROOT, 'tests')
export const DENO_CONFIG = path.join(EXAMPLE_ROOT, 'deno.json')

export function joinSrc(...parts: string[]): string {
  return path.join(SRC, ...parts)
}

export function joinTests(...parts: string[]): string {
  return path.join(TESTS, ...parts)
}

export function within(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate)
  return !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`../`) && !rel.startsWith(`..\\`)
}

export function stripLeadingSlashes(input: string): string {
  return input.replace(/^\/+/, '')
}
