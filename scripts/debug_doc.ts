const cmd = new Deno.Command(Deno.execPath(), {
  args: ['doc', '--json', 'packages/esbuild/mod.ts'],
  stdout: 'piped',
  stderr: 'piped',
})
const { stdout } = await cmd.output()
const doc = JSON.parse(new TextDecoder().decode(stdout))
const nodes = doc.nodes as Record<
  string,
  {
    symbols?: { name: string; declarations: { jsDoc?: unknown; def: Record<string, unknown> }[] }[]
  }
>
for (const [_fn, fd] of Object.entries(nodes)) {
  for (const sym of fd.symbols ?? []) {
    if (sym.name === 'build') {
      console.log(
        'build declarations:',
        JSON.stringify(sym.declarations, null, 2).substring(0, 1500),
      )
    }
  }
}
