import { mimeFor } from '@ggpwnkthx/esbuild-wrapper-shared'

export async function serveStatic(abs: string): Promise<Response> {
  try {
    const stat = await Deno.stat(abs)
    if (!stat.isFile) return new Response('not found', { status: 404 })
    const body = await Deno.readFile(abs)
    return new Response(body, {
      headers: { 'content-type': mimeFor(abs) },
    })
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return new Response('not found', { status: 404 })
    throw err
  }
}
