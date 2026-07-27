import type * as esbuild from 'esbuild'
import { type WorkspaceOptions } from '@deno/loader'
import { getPlatform } from './utils.ts'

export interface CommonOptions {
  /** Path to a `deno.json(c)` to drive the loader. Auto-discovered if omitted. */
  configPath?: string
  /** Platform conditions used by the Deno loader. */
  platform?: esbuild.Platform
  /** Skip Deno's transpile step before emission. */
  noTranspile?: boolean
  /** Keep JSX as-is rather than transpiling it through Deno's compiler. */
  preserveJsx?: boolean
  /** Print resolution/load decisions to stderr. */
  debug?: boolean
}

export function buildWorkspaceOptions(
  options: CommonOptions,
  initial: esbuild.BuildOptions = {},
): WorkspaceOptions {
  const workspaceOptions: WorkspaceOptions = {}
  if (initial.conditions !== undefined) {
    workspaceOptions.nodeConditions = initial.conditions
  }
  const platform = getPlatform(options.platform ?? initial.platform)
  if (platform !== undefined) workspaceOptions.platform = platform
  if (options.debug !== undefined) workspaceOptions.debug = options.debug
  if (options.configPath !== undefined) workspaceOptions.configPath = options.configPath
  if (options.noTranspile !== undefined) workspaceOptions.noTranspile = options.noTranspile
  if (options.preserveJsx !== undefined) workspaceOptions.preserveJsx = options.preserveJsx
  return workspaceOptions
}
