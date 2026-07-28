/**
 * @module
 * Normalization helpers for build-time options that don't fit the
 * single-key `getFlag` pattern: `entryPoints` (which can be either an
 * array or a `Record<string, string>`), `stdin` (which gets encoded to
 * UTF-8), and `nodePaths` (which need string coercion).
 *
 * @see ./build.ts
 * @see ./types.ts:BuildFlagsResult
 */
import type * as types from '../types/mod.ts'
import {
  checkForInvalidFlags,
  getFlag,
  mustBeString,
  mustBeStringOrUint8Array,
  type OptionKeys,
} from '../validation.ts'
import { validateStringValue } from '../string_helpers.ts'
import * as protocol from '../stdio_protocol/mod.ts'

/** Resolves a {@link types.BuildOptions.entryPoints} value into the
 * `[output, input]` pairs the transport sends to the service.
 *
 * The accepted shapes mirror the upstream esbuild API:
 * - An array of strings (each becomes `['', <input>]`)
 * - An array of `{ in, out }` objects
 * - A `Record<string, string>` mapping output names to inputs
 */
export function normalizeEntryPoints(
  entryPoints: types.BuildOptions['entryPoints'],
): [string, string][] {
  if (!entryPoints) return []
  const entries: [string, string][] = []

  if (Array.isArray(entryPoints)) {
    for (let i = 0, n = entryPoints.length; i < n; i++) {
      const entryPoint = entryPoints[i]
      if (typeof entryPoint === 'object' && entryPoint !== null) {
        const entryPointKeys: OptionKeys = Object.create(null)
        const input = getFlag(entryPoint, entryPointKeys, 'in', mustBeString)
        const output = getFlag(
          entryPoint,
          entryPointKeys,
          'out',
          mustBeString,
        )
        checkForInvalidFlags(
          entryPoint,
          entryPointKeys,
          'in entry point at index ' + i,
        )
        if (input === undefined) {
          throw new Error(
            'Missing property "in" for entry point at index ' + i,
          )
        }
        if (output === undefined) {
          throw new Error(
            'Missing property "out" for entry point at index ' + i,
          )
        }
        entries.push([output, input])
      } else {
        entries.push([
          '',
          validateStringValue(entryPoint, 'entry point at index ' + i),
        ])
      }
    }
  } else {
    for (const key in entryPoints) {
      entries.push([
        key,
        validateStringValue(entryPoints[key], 'entry point', key),
      ])
    }
  }

  return entries
}

/** Resolves a {@link types.BuildOptions.stdin} value into the
 * `[contents, resolveDir, flags]` triple the transport needs. */
export function normalizeStdin(
  stdin: types.BuildOptions['stdin'],
  flags: string[],
): [Uint8Array | null, string | null] {
  if (!stdin) return [null, null]

  const stdinKeys: OptionKeys = Object.create(null)
  const contents = getFlag(
    stdin,
    stdinKeys,
    'contents',
    mustBeStringOrUint8Array,
  )
  const resolveDir = getFlag(stdin, stdinKeys, 'resolveDir', mustBeString)
  const sourcefile = getFlag(stdin, stdinKeys, 'sourcefile', mustBeString)
  const loader = getFlag(stdin, stdinKeys, 'loader', mustBeString)
  checkForInvalidFlags(stdin, stdinKeys, 'in "stdin" object')

  if (sourcefile) flags.push(`--sourcefile=${sourcefile}`)
  if (loader) flags.push(`--loader=${loader}`)

  let stdinContents: Uint8Array | null = null
  if (typeof contents === 'string') {
    stdinContents = protocol.encodeUTF8(contents)
  } else if (contents instanceof Uint8Array) stdinContents = contents

  return [stdinContents, resolveDir ?? null]
}

/** Coerces each entry of `nodePathsInput` to a string and returns the
 * resulting array. Mirrors the upstream esbuild `nodePaths` behavior. */
export function normalizeNodePaths(
  nodePathsInput: string[] | undefined,
): string[] {
  const nodePaths: string[] = []
  if (nodePathsInput) {
    for (let value of nodePathsInput) {
      value += ''
      nodePaths.push(value)
    }
  }
  return nodePaths
}
