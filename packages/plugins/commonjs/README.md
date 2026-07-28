# `@ggpwnkthx/esbuild-plugin-commonjs`

> esbuild plugin that converts CommonJS source files to ESM at the `onLoad` step so they bundle
> cleanly into a browser-targeted ESM payload. Deno-first TypeScript rewrite built on
> [`acorn`](https://github.com/acornjs/acorn) (parse) +
> [`astring`](https://github.com/davidbonnet/astring) (code generation); no Babel runtime, no SWC
> binary.

## What it does

For files that look like CommonJS — `module.exports = X`, `exports.X = Y`, `require("mod")`,
`__dirname`, `__filename` — the plugin replaces the file's contents with the equivalent ESM output
and tells esbuild to load it as `loader: 'js'`. Top-level `require(spec)` calls become static
`import` statements; top-level `module.exports = X` becomes `export default X`. esbuild then sees a
real ESM module and bundles normally.

The transform is a hand-rolled AST walker in `transform.ts` (acorn for parse, astring for codegen) —
no Babel runtime, no SWC binary. Recognised CJS shapes include:

| CJS shape                         | ESM output                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| `var X = require("spec")`         | `import X from "spec"`                                                                 |
| `var { a, b } = require("spec")`  | `import { a as a } from "spec"; import { b as b } from "spec"` (separate declarations) |
| `require("spec")` (side-effect)   | `import "spec"`                                                                        |
| `module.exports = X`              | `export default X`                                                                     |
| `module.exports = require("mod")` | `import * as ns from "mod"; export default ns`                                         |
| `module.exports = { foo: 1 }`     | `const foo = 1; export default { foo }`                                                |
| `exports.X = Y`                   | left in place; `X` becomes a free identifier                                           |

A pre-pass (`looksLikeCjs`) detects whether the file is worth transforming by looking for the CJS
surface in source text — a fast text-based scan that returns `true` whenever the CJS surface appears
anywhere outside of the top-level structure. The downstream acorn+astring AST walk handles strings
and comments correctly, so a false positive from the pre-pass just causes an unnecessary parse + AST
walk, not a wrong rewrite.

The plugin's value-add over esbuild's built-in CJS handling is `filter` — esbuild's default CJS
handler runs on every CJS file the bundler encounters; the plugin lets you opt only the ones you
care about into the transform path.

## Usage

```ts
import * as esbuild from 'esbuild'
import commonjsPlugin from '@ggpwnkthx/esbuild-plugin-commonjs'

await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  plugins: [commonjsPlugin()],
})
```

### Options

```ts
commonjsPlugin({
  // Only transform files whose absolute path matches one of these
  // regexes. Defaults to every loaded `.c?[jt]sx?` file.
  filter?: RegExp | RegExp[],

  // Whether to emit a source map for the transformed output. Off by
  // default — the dev server doesn't need source maps and esbuild
  // caches the onLoad content either way.
  sourcemap?: boolean,
})
```

## Limitations

- **Output format is `esm` only.** The plugin short-circuits in `setup()` when
  `build.initialOptions.format !== "esm"`. For CJS / IIFE output, esbuild's built-in CJS handling is
  the right thing and the plugin does nothing.
- **Inner `require(spec)` calls inside IIFEs stay as `__require2(spec)`.** The transform handles
  top-level `require` and `module.exports`; dynamic `require` inside a function body is left to
  esbuild's built-in runtime helper, which throws `Dynamic require of "spec" is not
  supported` for
  any spec on the build's `external` list. For bundles like React 19's CJS source that do
  `var X = require("react")` at module top scope, the rewrite is enough; for files that bury the
  `require` inside an IIFE, the user still needs a runtime shim.
- **No CJS-specific dependency** — the plugin uses `Deno.readTextFileSync` for the file read and
  delegates the bundling to esbuild.

## Deno tasks

```sh
deno task fmt      # deno fmt .
deno task lint     # deno lint .
deno task check    # deno check .
deno task test     # deno test --allow-read --allow-write --allow-env --allow-run
deno task ci       # fmt --check && lint && check && test
```

## License

MIT
