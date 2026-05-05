# `@ggpwnkthx/esbuild-plugin-deno`

An esbuild plugin that integrates Deno's module resolution, import map
semantics, and transpilation pipeline into esbuild builds. Use Deno-compatible
modules seamlessly in esbuild-powered workflows.

## Overview

This plugin hooks into esbuild's resolution and loading lifecycle to hand off
module resolution to Deno's built-in resolver and loader. It supports:

- **Module resolution** for `file:`, `http:`, `https:`, `npm:`, `jsr:`, and
  other Deno schemes
- **Import map semantics** — `deno.json` import maps are respected automatically
- **TypeScript / JSX transpilation** via Deno's built-in loader
- **Environment variable inlining** — prefix environment variables to embed
  their values at build time (e.g. `PUBLIC_` vars)
- **`deno.json` discovery** — automatically finds config in the current working
  directory, or use `configPath` to pin a specific file
- **`noTranspile` mode** — pass source files through without Deno's
  transpilation step
- **`preserveJsx` mode** — keep JSX as-is (useful when the runtime handles JSX
  natively)

## Quick start

```ts
import * as esbuild from "esbuild";
import { denoPlugin } from "@ggpwnkthx/esbuild-plugin-deno";

const ctx = await esbuild.build({
  entryPoints: ["./main.ts"],
  bundle: true,
  plugins: [denoPlugin()],
});

await ctx.dispose();
```

`main.ts` can use Deno APIs, remote imports, npm packages, jsr packages, and an
import map — all resolved and loaded through Deno's standard mechanisms.

## Options

### `debug?: boolean`

Prints resolution and loading decisions to the console. Useful for understanding
why a module resolved to a particular path or which import map entries matched.

**Default:** `false`

---

### `configPath?: string`

Path to a `deno.json` file. When set, the plugin uses this file instead of
searching for one in the current working directory.

**Default:** auto-discovered from the current directory

---

### `noTranspile?: boolean`

Skips Deno's transpilation step. Source files are loaded as-is, including
TypeScript and JSX. Use this when your build pipeline handles transpilation
separately or when you are consuming modules that do not need transformation.

**Default:** `false`

---

### `preserveJsx?: boolean`

Keeps JSX syntax as-is instead of transpiling it according to the compiler
options in `deno.json`. This is useful when the target runtime handles JSX
natively (e.g., a Deno Fresh application or a custom JSX runtime).

**Default:** `false`

---

### `publicEnvVarPrefix?: string`

A prefix that marks environment variables to be inlined at build time. Any
`Deno.env.get`, `process.env`, or `import.meta.env` reference whose variable
name begins with the given prefix will have its value embedded as a string
literal in the output bundle.

**Default:** none (inlining is disabled)

**Example:**

Given `publicEnvVarPrefix: "PUBLIC_"` and the environment variable
`PUBLIC_API_URL=https://api.example.com`:

```ts
// source
const url = Deno.env.get("PUBLIC_API_URL");

// bundled output
const url = "https://api.example.com";
```

The prefix also works with destructuring from `Deno.env`:

```ts
// source
const { PUBLIC_API_URL, PUBLIC_KEY } = Deno.env;

// bundled output
const { PUBLIC_API_URL = "https://api.example.com", PUBLIC_KEY = null } =
  Deno.env;
```

Note: `process.env` and `import.meta.env` references are only inlined when the
variable name starts with the configured prefix.

## What the plugin handles

### Resolution schemes

The plugin resolves imports using Deno's standard resolution algorithm. The
following schemes are handled:

| Scheme   | Example                      | Notes                                     |
| -------- | ---------------------------- | ----------------------------------------- |
| `file:`  | `file:///path/to/module.ts`  | Resolved relative to the referrer         |
| `http:`  | `http://example.com/mod.ts`  | Loaded over HTTP                          |
| `https:` | `https://example.com/mod.ts` | Loaded over HTTPS                         |
| `npm:`   | `npm:express`                | Resolved via the npm specifier resolution |
| `jsr:`   | `jsr:@std/path`              | Resolved via the JSR registry             |

Bare specifiers (e.g. `react`, `@std/path`) are resolved through any import map
defined in `deno.json`, or through Deno's module registry.

### Transpilation

TypeScript (`.ts`, `.mts`, `.cts`) and JSX (`.tsx`, `.jsx`) files are transpiled
using Deno's built-in loader, which applies the compiler options from
`deno.json`. This includes type stripping, JSX transform, and target language
emission.

Use `noTranspile: true` to skip this step, or `preserveJsx: true` to keep JSX
source as-is.

### Environment variable inlining

When `publicEnvVarPrefix` is set, the plugin scans loaded source code for:

- `Deno.env.get("PREFIX_VAR")`
- `Deno.env.get('PREFIX_VAR')`
- `process.env.PREFIX_VAR`
- `import.meta.env.PREFIX_VAR`
- `const { PREFIX_A, PREFIX_B } = Deno.env`

Matching references are replaced with their string values at build time. If an
environment variable is not set, the value is `null` (rendered as a JSON string
literal: `"null"`).

## Full example with environment variable inlining

```json
// deno.json
{
  "imports": {
    "fmt": "jsr:@std/fmt"
  },
  "compilerOptions": {
    "jsx": "react-jsx"
  },
  "lint": {
    "rules": { "tags": ["recommended"] }
  }
}
```

```sh
# Set a public environment variable before building
export PUBLIC_API_URL="https://api.example.com"
export PUBLIC_APP_NAME="MyApp"
```

```ts
// src/main.ts
import { format } from "fmt";

const apiUrl = Deno.env.get("PUBLIC_API_URL");
const appName = Deno.env.get("PUBLIC_APP_NAME");

const { PUBLIC_KEY, PUBLIC_SECRET } = Deno.env;

console.log(format([apiUrl, appName, PUBLIC_KEY, PUBLIC_SECRET]));
```

```ts
// build.ts
import * as esbuild from "esbuild";
import { denoPlugin } from "@ggpwnkthx/esbuild-plugin-deno";

const ctx = await esbuild.build({
  entryPoints: ["./src/main.ts"],
  bundle: true,
  outdir: "./dist",
  plugins: [
    denoPlugin({
      publicEnvVarPrefix: "PUBLIC_",
      debug: true,
    }),
  ],
});

await ctx.dispose();
```

Running `deno run -A build.ts` produces a bundled output where the
`PUBLIC_`-prefixed environment variable references have been replaced with their
string values.

## Dependencies

- `@deno/loader` — module resolution, import maps, and transpilation
- `@std/path` — file URL / path conversion utilities

These are declared as `jsr:` dependencies in `deno.json` and resolved through
Deno's standard import resolution.
