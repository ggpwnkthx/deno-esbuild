/**
 * CI guard: every public export must carry a JSDoc block.
 *
 * Walks each workspace package's `deno.json` `exports` map, runs
 * `deno doc --json` on each entrypoint, and fails the run if any exported
 * declaration is missing a `jsDoc` field.
 */

type Json = Record<string, unknown>

interface Package {
  dir: string
  exports: Record<string, string>
}

const workspace = JSON.parse(
  await Deno.readTextFile(new URL('../deno.json', import.meta.url)),
) as Json

const members = (workspace.workspace as string[] | undefined) ?? []

const packages: Package[] = []
for (const member of members) {
  const denoJsonPath = new URL(`../${member}/deno.json`, import.meta.url)
  const pkg = JSON.parse(await Deno.readTextFile(denoJsonPath)) as Json
  const exports = normalizeExports(pkg.exports)
  if (exports) packages.push({ dir: member, exports })
}

interface DocNode {
  name: string
  isDefault?: boolean
  jsDoc?: { doc?: string }
  declarationKind: string
}

interface DocFile {
  module_doc?: unknown
  symbols: DocNode[]
}

const failures: { file: string; symbol: string; kind: string }[] = []

for (const pkg of packages) {
  for (const [subpath, relTarget] of Object.entries(pkg.exports)) {
    const cmd = new Deno.Command(Deno.execPath(), {
      args: ['doc', '--json', relTarget],
      cwd: new URL(`../${pkg.dir}/`, import.meta.url),
      stdout: 'piped',
      stderr: 'piped',
    })
    const { code, stdout, stderr } = await cmd.output()
    if (code !== 0) {
      const errText = new TextDecoder().decode(stderr)
      throw new Error(
        `deno doc failed for ${pkg.dir}${subpath} (${relTarget}):\n${errText}`,
      )
    }
    const doc = JSON.parse(new TextDecoder().decode(stdout)) as {
      nodes: Record<string, DocFile>
    }

    for (const [fileUrl, fileDoc] of Object.entries(doc.nodes)) {
      if (!fileDoc.symbols) continue
      for (const sym of fileDoc.symbols) {
        if (sym.declarationKind !== 'export') continue
        if (sym.jsDoc?.doc) continue
        const label = sym.isDefault ? `default` : sym.name
        failures.push({
          file: fileUrl.replace(/^file:\/\//, ''),
          symbol: label,
          kind: sym.declarationKind,
        })
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Undocumented exports found:')
  for (const f of failures) {
    console.error(`  ${f.file} :: ${f.symbol}`)
  }
  console.error(
    `\n${failures.length} export(s) missing JSDoc. Add a /** ... */ block above each.`,
  )
  Deno.exit(1)
}

console.log('All exported symbols have JSDoc.')

function normalizeExports(
  raw: unknown,
): Record<string, string> | null {
  if (raw == null) return null
  if (typeof raw === 'string') return { '.': raw }
  if (typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}
