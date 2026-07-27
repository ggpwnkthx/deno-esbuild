import { createTranspiler, rewriteImports } from '@ggpwnkthx/esbuild-wrapper-shared'
import { moduleUrlForAllowedSpec } from './allowlist.ts'

const transpiler = createTranspiler({
  cache: true,
  transformOptions: {
    jsx: 'automatic',
    jsxImportSource: 'react',
    format: 'esm',
    target: 'es2022',
  },
})

export interface TransformedModule {
  code: string
}

export function failureBody(rel: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return `throw new Error(${JSON.stringify(`transform failed for ${rel}: ${message}`)});`
}

async function statMtime(abs: string): Promise<number | null> {
  try {
    const mtime = (await Deno.stat(abs)).mtime
    return mtime ? mtime.getTime() : null
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return null
    throw err
  }
}

export async function transformLocal(
  abs: string,
  rel: string,
): Promise<TransformedModule> {
  const body = await Deno.readTextFile(abs)
  const { code } = await transpiler.getCachedOrTranspile({
    pathname: abs,
    body,
    shouldStop: false,
    version: await statMtime(abs) ?? undefined,
    postProcess: (transformed) =>
      rewriteImports(transformed, {
        specifier: rel,
        defaultJsxImportSource: 'react',
        jsxImportSourceModule: 'jsx-runtime',
        resolveBareSpecifier: moduleUrlForAllowedSpec,
        failAsErrorBody: true,
      }),
  })
  return { code }
}

export function clearTransformCache(): void {
  transpiler.clearCache()
}
