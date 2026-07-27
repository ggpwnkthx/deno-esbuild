import type { DenoPluginHandle } from '@ggpwnkthx/esbuild-plugin-deno'
import { createDenoPlugin } from '@ggpwnkthx/esbuild-plugin-deno'
import { DENO_CONFIG } from './paths.ts'

let cached: DenoPluginHandle | undefined

export async function loadPlugin(): Promise<DenoPluginHandle> {
  if (cached) return cached
  cached = await createDenoPlugin({ configPath: DENO_CONFIG })
  addEventListener('unload', () => {
    cached?.[Symbol.dispose]()
    cached = undefined
  })
  return cached
}
