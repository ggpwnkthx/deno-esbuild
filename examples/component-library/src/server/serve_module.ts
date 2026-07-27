import type { DenoPluginHandle } from '@ggpwnkthx/esbuild-plugin-deno'
import * as esbuild from '@ggpwnkthx/esbuild'
import { JS_MIME, rewriteImports } from '@ggpwnkthx/esbuild-wrapper-shared'
import { isAllowedModuleSpec, moduleUrlForAllowedSpec } from './allowlist.ts'

async function bundledShim(handle: DenoPluginHandle, abs: string): Promise<string> {
  const result = await esbuild.build({
    stdin: {
      contents: `import * as ns from ${JSON.stringify(abs)};` +
        ` export const jsx = ns.jsx ?? ns.default?.jsx ?? ns.default;` +
        ` export const jsxs = ns.jsxs ?? ns.default?.jsxs;` +
        ` export const Fragment = ns.Fragment ?? ns.default?.Fragment;` +
        ` export const createRoot = ns.createRoot ?? ns.default?.createRoot;` +
        ` export const hydrateRoot = ns.hydrateRoot ?? ns.default?.hydrateRoot;`,
      resolveDir: abs.replace(/[^/\\]+$/, ''),
      sourcefile: '<module-shim>',
      loader: 'js',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    sourcemap: false,
    plugins: [handle.plugin],
  })
  return result.outputFiles?.[0]?.text ?? ''
}

export async function serveModule(
  handle: DenoPluginHandle,
  rawSpec: string,
): Promise<Response> {
  if (!isAllowedModuleSpec(rawSpec)) {
    return new Response('forbidden', { status: 403 })
  }
  const spec = decodeURIComponent(rawSpec)
  try {
    let resolved
    try {
      resolved = await handle.resolve(spec)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return new Response(
        `throw new Error(${JSON.stringify(`module resolve failed for ${spec}: ${message}`)});`,
        { headers: { 'content-type': JS_MIME } },
      )
    }
    const raw = await bundledShim(handle, resolved.absPath)
    const code = await rewriteImports(raw, {
      specifier: spec,
      defaultJsxImportSource: 'react',
      jsxImportSourceModule: 'jsx-runtime',
      resolveBareSpecifier: moduleUrlForAllowedSpec,
    })
    return new Response(code, { headers: { 'content-type': JS_MIME } })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`module build failed for ${spec}: ${message}`)
    return new Response(
      `throw new Error(${JSON.stringify(`module build failed for ${spec}: ${message}`)});`,
      { headers: { 'content-type': JS_MIME } },
    )
  }
}
