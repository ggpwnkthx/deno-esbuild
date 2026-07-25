/**
 * CI guard: every public symbol must carry a JSDoc block.
 *
 * Walks each workspace package's `deno.json` `exports` map, runs
 * `deno doc --json` on each entrypoint, and fails the run if any exported
 * declaration — including nested interface/class members — is missing a
 * `jsDoc` field.
 *
 * Vendored files are excluded via {@link VENDORED_FILES}. Inner-function
 * locals are not part of the AST that `deno doc` traverses, so they are
 * implicitly exempt.
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

/**
 * Directory names whose source files are subject to the JSDoc guard. Other
 * workspace packages are walked only for export-resolution purposes but
 * their symbols are not checked here.
 */
const SCOPED_DIRS: ReadonlySet<string> = new Set([
  'packages/esbuild',
])

const packages: Package[] = []
for (const member of members) {
  // `deno.json#workspace` prefixes member paths with `./`.
  const normalized = member.replace(/^\.\//, '')
  if (!SCOPED_DIRS.has(normalized)) continue
  const denoJsonPath = new URL(`../${member}/deno.json`, import.meta.url)
  const pkg = JSON.parse(await Deno.readTextFile(denoJsonPath)) as Json
  const exports = normalizeExports(pkg.exports)
  if (exports) packages.push({ dir: member, exports })
}

interface Location {
  filename: string
  line: number
  col: number
}

interface JsDoc {
  doc?: string
}

interface BaseMember {
  name: string
  jsDoc?: JsDoc
  location?: Location
  optional?: boolean
}

interface TypeMember extends BaseMember {
  tsType?: unknown
}

interface MethodMember extends BaseMember {
  kind: 'method'
  params?: unknown[]
  returnType?: unknown
}

interface ClassConstructorMember extends BaseMember {
  kind: 'constructor'
  params?: unknown[]
}

interface PropertyMember extends BaseMember {
  tsType?: unknown
}

interface CallSignatureMember extends BaseMember {
  kind: 'callSignature'
  params?: unknown[]
  returnType?: unknown
}

interface IndexSignatureMember extends BaseMember {
  kind: 'indexSignature'
  params?: unknown[]
  returnType?: unknown
}

interface ConstructorMember extends BaseMember {
  kind: 'constructor'
  params?: unknown[]
}

type ClassMember =
  | MethodMember
  | PropertyMember
  | ClassConstructorMember
  | CallSignatureMember
  | IndexSignatureMember
  | ConstructorMember

interface SymbolDef {
  properties?: TypeMember[]
  methods?: MethodMember[]
  extends?: unknown
  callSignatures?: CallSignatureMember[]
  indexSignatures?: IndexSignatureMember[]
  constructor?: ConstructorMember
  constructors?: ConstructorMember[]
  typeParams?: { name: string; constraint?: unknown }[]
}

interface Declaration {
  name: string
  isDefault?: boolean
  jsDoc?: JsDoc
  declarationKind: string
  kind: string
  location?: Location
  def?: SymbolDef
}

interface Symbol {
  name: string
  isDefault?: boolean
  jsDoc?: JsDoc
  declarationKind: string
  declarations: Declaration[]
}

interface DocFile {
  module_doc?: unknown
  symbols: Symbol[]
}

interface Doc {
  nodes: Record<string, DocFile>
}

const failures: { file: string; symbol: string; kind: string; line: number }[] = []

/**
 * Files excluded from the JSDoc guard because they are vendored from
 * upstream sources whose style and licensing we do not control.
 * Matched as filename suffixes so the entries don't have to encode the
 * absolute path of the workspace.
 */
const VENDORED_FILES: ReadonlyArray<string> = [
  '/packages/esbuild/shared/go_wasm.ts',
  '/packages/esbuild/shared/uint8array_json_parser.ts',
]

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
    const doc = JSON.parse(new TextDecoder().decode(stdout)) as Doc

    for (const [fileUrl, fileDoc] of Object.entries(doc.nodes)) {
      if (VENDORED_FILES.some((suffix) => fileUrl.endsWith(suffix))) continue
      if (!fileDoc.symbols) continue
      for (const sym of fileDoc.symbols) {
        walkSymbol(sym, sym.name, fileUrl)
      }
    }
  }
}

function walkSymbol(
  sym: Symbol,
  prefix: string,
  fileUrl: string,
): void {
  // A symbol is considered documented if any of its declarations carries a
  // JSDoc block. Both the `doc` text and the `tags` array count as
  // documentation; the latter carries `@see`, `@param`, `@example`, etc.
  // This lets barrel modules like `shared/mod.ts` re-export symbols whose
  // documentation lives in the original source file.
  const hasDocs = sym.declarations.some((d) => hasJsDoc(d.jsDoc))
  if (!hasDocs) {
    const first = sym.declarations[0]
    if (first) {
      failures.push({
        file: fileUrl.replace(/^file:\/\//, ''),
        symbol: prefix,
        kind: first.declarationKind || first.kind,
        line: first.location?.line ?? 0,
      })
    }
  }
  for (const decl of sym.declarations) {
    if (!decl.def) continue
    walkDef(decl.def, fileUrl, decl.location?.line ?? 0)
  }
}

function hasJsDoc(doc: JsDoc | undefined): boolean {
  if (!doc) return false
  if (doc.doc) return true
  // A JSDoc block with only `@see`/`@param`/`@example`/etc. tags is still
  // documentation: this is the conventional shape used for "see the upstream
  // type" re-exports in the public API.
  return ((doc as { tags?: unknown[] }).tags?.length ?? 0) > 0
}

function walkDef(def: SymbolDef, fileUrl: string, declLine: number): void {
  if (def.properties) {
    for (const prop of def.properties) {
      if (!hasJsDoc(prop.jsDoc)) {
        failures.push({
          file: fileUrl.replace(/^file:\/\//, ''),
          symbol: prop.name,
          kind: 'property',
          line: prop.location?.line ?? declLine,
        })
      }
    }
  }
  if (def.methods) {
    for (const method of def.methods) {
      if (!hasJsDoc(method.jsDoc)) {
        failures.push({
          file: fileUrl.replace(/^file:\/\//, ''),
          symbol: method.name,
          kind: 'method',
          line: method.location?.line ?? declLine,
        })
      }
    }
  }
  if (def.callSignatures) {
    for (const sig of def.callSignatures) {
      if (!hasJsDoc(sig.jsDoc)) {
        failures.push({
          file: fileUrl.replace(/^file:\/\//, ''),
          symbol: '<call>',
          kind: 'callSignature',
          line: sig.location?.line ?? declLine,
        })
      }
    }
  }
  if (def.indexSignatures) {
    for (const sig of def.indexSignatures) {
      if (!hasJsDoc(sig.jsDoc)) {
        failures.push({
          file: fileUrl.replace(/^file:\/\//, ''),
          symbol: '<index>',
          kind: 'indexSignature',
          line: sig.location?.line ?? declLine,
        })
      }
    }
  }
  if (def.constructors) {
    for (const c of def.constructors) {
      if (!hasJsDoc(c.jsDoc)) {
        failures.push({
          file: fileUrl.replace(/^file:\/\//, ''),
          symbol: 'constructor',
          kind: 'constructor',
          line: c.location?.line ?? declLine,
        })
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Undocumented symbols found:')
  for (const f of failures) {
    console.error(`  ${f.file}:${f.line} :: ${f.symbol} (${f.kind})`)
  }
  console.error(
    `\n${failures.length} symbol(s) missing JSDoc. Add a /** ... */ block above each.`,
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
