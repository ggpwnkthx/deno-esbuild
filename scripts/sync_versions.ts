/**
 * Sync sibling `jsr:@ggpwnkthx/<name>@<spec>` pins in each package's
 * `deno.json` to match the current local `version` of the target package.
 *
 * Why: each member's `deno.json` is what JSR ships. If a dependency pin
 * drifts from the local source version, the published tarball will resolve
 * the sibling from the registry instead of the freshly-built local source.
 * The root `deno.json` `scopes` block already redirects local resolution
 * to the sibling directories; this script keeps the published `jsr:` pins
 * in lock-step with the local versions so the two views stay consistent.
 *
 * Usage:
 *   deno task versions:sync         # rewrite pins in place
 *   deno task versions:check        # exit non-zero if any pin would change
 */

type Json = Record<string, unknown>

interface MemberConfig {
  name: string
  version: string
  imports?: Record<string, string>
  exports?: Record<string, string> | string
  publish?: { include?: string[] }
  tasks?: Record<string, string>
}

const SIBLING_SPEC = /^jsr:(@ggpwnkthx\/[^@/]+)@/i

const rootConfig = JSON.parse(
  await Deno.readTextFile(new URL('../deno.json', import.meta.url)),
) as Json

const members = (rootConfig.workspace as string[] | undefined) ?? []
if (members.length === 0) {
  throw new Error('No workspace members found in root deno.json')
}

const nameToVersion = new Map<string, string>()
for (const member of members) {
  const cfg = JSON.parse(
    await Deno.readTextFile(new URL(`../${member}/deno.json`, import.meta.url)),
  ) as MemberConfig
  if (!cfg.name || !cfg.version) {
    // Workspace members without a JSR `name` and `version` (e.g. local-only
    // demo apps like `examples/component-library`) have nothing to publish
    // and nothing to pin against. Skip them in both the registry-building
    // pass and the sibling-pin rewrite pass below.
    continue
  }
  if (nameToVersion.has(cfg.name) && nameToVersion.get(cfg.name) !== cfg.version) {
    throw new Error(
      `Conflicting version for ${cfg.name}: ${nameToVersion.get(cfg.name)} vs ${cfg.version}`,
    )
  }
  nameToVersion.set(cfg.name, cfg.version)
}

const checkOnly = Deno.args.includes('--check')
const stale: { member: string; key: string; from: string; to: string }[] = []

for (const member of members) {
  const url = new URL(`../${member}/deno.json`, import.meta.url)
  const original = await Deno.readTextFile(url)
  const cfg = JSON.parse(original) as MemberConfig
  if (!cfg.name || !cfg.version) {
    // Skip non-published workspace members (see note above).
    continue
  }
  let dirty = false

  if (cfg.imports) {
    for (const [key, value] of Object.entries(cfg.imports)) {
      if (typeof value !== 'string') continue
      const match = value.match(SIBLING_SPEC)
      if (!match || !match[1]) continue
      const targetName = match[1]
      const targetVersion = nameToVersion.get(targetName)
      if (!targetVersion) continue
      const desired = `jsr:${targetName}@^${targetVersion}`
      if (value === desired) continue
      stale.push({ member, key, from: value, to: desired })
      if (!checkOnly) {
        cfg.imports[key] = desired
        dirty = true
      }
    }
  }

  if (dirty && !checkOnly) {
    const formatted = JSON.stringify(cfg, null, 2) + '\n'
    await Deno.writeTextFile(url, formatted)
  }
}

if (stale.length === 0) {
  console.log('All sibling pins are in sync.')
  Deno.exit(0)
}

if (checkOnly) {
  console.error(`Found ${stale.length} stale sibling pin(s):`)
  for (const s of stale) {
    console.error(`  ${s.member} :: ${s.key}\n    ${s.from}\n -> ${s.to}`)
  }
  console.error('\nRun `deno task versions:sync` to update them.')
  Deno.exit(1)
}

console.log(`Updated ${stale.length} sibling pin(s):`)
for (const s of stale) {
  console.log(`  ${s.member} :: ${s.key}\n    ${s.from}\n -> ${s.to}`)
}
