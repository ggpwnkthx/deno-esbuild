# deno-esbuild workspace

Deno-first packages for using [esbuild](https://esbuild.github.io/) in Deno projects. This
repository contains a native esbuild wrapper, a WASM entrypoint, Deno/CSS esbuild plugins, and
Hono/Oak development middleware.

Each package in this workspace is versioned and published independently on JSR. The bundled esbuild
API targets esbuild binary version `0.28.1`.

## Packages

| Package                             | JSR                                                                                                                 | README                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `@ggpwnkthx/esbuild`                | [![JSR](https://jsr.io/badges/@ggpwnkthx/esbuild)](https://jsr.io/@ggpwnkthx/esbuild)                               | [packages/esbuild/README.md](./packages/esbuild/README.md)                 |
| `@ggpwnkthx/esbuild-plugin-deno`    | [![JSR](https://jsr.io/badges/@ggpwnkthx/esbuild-plugin-deno)](https://jsr.io/@ggpwnkthx/esbuild-plugin-deno)       | [packages/plugins/deno/README.md](./packages/plugins/deno/README.md)       |
| `@ggpwnkthx/esbuild-plugin-css`     | [![JSR](https://jsr.io/badges/@ggpwnkthx/esbuild-plugin-css)](https://jsr.io/@ggpwnkthx/esbuild-plugin-css)         | [packages/plugins/css/README.md](./packages/plugins/css/README.md)         |
| `@ggpwnkthx/esbuild-wrapper-shared` | [![JSR](https://jsr.io/badges/@ggpwnkthx/esbuild-wrapper-shared)](https://jsr.io/@ggpwnkthx/esbuild-wrapper-shared) | [packages/wrappers/shared/README.md](./packages/wrappers/shared/README.md) |
| `@ggpwnkthx/esbuild-wrapper-hono`   | [![JSR](https://jsr.io/badges/@ggpwnkthx/esbuild-wrapper-hono)](https://jsr.io/@ggpwnkthx/esbuild-wrapper-hono)     | [packages/wrappers/hono/README.md](./packages/wrappers/hono/README.md)     |
| `@ggpwnkthx/esbuild-wrapper-oak`    | [![JSR](https://jsr.io/badges/@ggpwnkthx/esbuild-wrapper-oak)](https://jsr.io/@ggpwnkthx/esbuild-wrapper-oak)       | [packages/wrappers/oak/README.md](./packages/wrappers/oak/README.md)       |

Each package has its own README, CHANGELOG, LICENSE, deno.json, exports, and package-level tasks.
The per-package READMEs cover installation, configuration, API reference, and examples.

## Repository layout

```txt
.
├── deno.json
├── examples/component-library/   # component-library demo
├── packages/
│   ├── esbuild/
│   ├── plugins/
│   │   ├── css/
│   │   └── deno/
│   └── wrappers/
│       ├── hono/
│       ├── oak/
│       └── shared/
└── scripts/
```

The root `deno.json` defines the workspace and a `scopes` block that redirects each member's
`jsr:@ggpwnkthx/...` imports to the local sibling directory during development. The `scripts/`
directory holds workspace tooling for building and verifying esbuild release assets.

## Workspace conventions

- **Deno 2.x** is required.
- **Per-package versioning.** Each member bumps its own version independently in its
  `packages/*/deno.json`. The root `deno task versions:sync` rewrites sibling `jsr:` pins so the
  published tarballs always reference the in-tree versions.
- **Conventional Commits.** Commit subjects follow
  [Conventional Commits](./CONVENTIONAL_COMMITS.md). Per-package version bumps are noted in each
  package's `CHANGELOG.md`; workspace-wide changes (CI, release coordination, tooling) are noted in
  the root [CHANGELOG.md](./CHANGELOG.md).
- **Local sibling imports.** Each member's `deno.json` ships `jsr:@ggpwnkthx/...` references for JSR
  consumers, while the root `scopes` block overrides those to the local sibling path during
  development so `deno task ci` and `deno test` resolve against the in-tree source.

## Development

Root workspace tasks (defined in `deno.json`):

```bash
deno task ci             # fmt --check + lint + check + doc:check across the workspace
deno task doc:check      # verify all exports are JSDoc-documented
deno task bin:list       # print the esbuild release assets each member would download
deno task bin:build      # build & publish the native esbuild binaries to GitHub releases
deno task versions:sync  # rewrite sibling jsr:@ggpwnkthx/... pins to match in-tree versions
deno task versions:check # assert sibling pins are in sync (CI-friendly)
```

Per-package tasks (run inside a package directory):

```bash
deno task fmt
deno task lint
deno task check
deno task test
deno task ci
```

## Releasing

See [CONTRIBUTING.md → Releasing](./CONTRIBUTING.md#releasing) for the full workflow (bump →
`versions:sync` → publish in dependency order). CI runs `versions:check` so a drift between in-tree
versions and published pins fails the build.

## Security

See [SECURITY.md](./SECURITY.md) for how to report vulnerabilities.

## License

[MIT](./LICENSE.md).
