export function inlinePublicEnvVars(code: string, envPrefix: string): string {
  let out = code.replaceAll(
    /Deno\.env\.get\(["']([^)]+)['"]\)|process\.env\.([\w_-]+)|import\.meta\.env\.([\w_]+)/g,
    (m, name, processName, importMetaName) => {
      if (name !== undefined && name.startsWith(envPrefix)) {
        return literal(Deno.env.get(name) ?? null)
      }
      if (processName !== undefined && processName.startsWith(envPrefix)) {
        return literal(Deno.env.get(processName) ?? null)
      }
      if (importMetaName !== undefined && importMetaName.startsWith(envPrefix)) {
        return literal(Deno.env.get(importMetaName) ?? null)
      }
      return m
    },
  )

  out = out.replaceAll(
    /const\s+\{\s*([\w_]+(?:\s*,\s*[\w_]+)*)\s*\}\s*=\s*Deno\.env/g,
    (match: string, identList: string) => {
      const ids = identList.split(',').map((s: string) => s.trim())
      const allMatch = ids.every((id: string) => id.startsWith(envPrefix))
      if (!allMatch) return match
      const inlined = ids.map((id: string) => {
        const v = Deno.env.get(id) ?? null
        return `${id} = ${literal(v)}`
      })
      return `const { ${inlined.join(', ')} } = Deno.env`
    },
  )
  return out
}

function literal(v: string | null): string {
  const s = JSON.stringify(v)
  return s === 'null' ? `"null"` : s
}
