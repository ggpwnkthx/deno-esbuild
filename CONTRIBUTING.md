# Contributions

Thanks for your interest in contributing.

## Before You Start

Please read the README first for an overview of this workspace.

## Development Setup

1. Fork and clone the repository.
2. Install Deno 2.x.
3. From the repository root, run:

   ```bash
   deno task ci
   ```

   This runs `deno fmt --check`, `deno lint`, and `deno check` against the whole workspace (every
   package, every `mod.ts`/`wasm.ts`/`utils.ts` reachable from each `deno.json`'s `exports`).

## Repository Layout

The repo is a Deno workspace. Each member is a standalone JSR-shaped package:

| Path                        | Package                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `packages/esbuild/`         | `@ggpwnkthx/esbuild`                                                               |
| `packages/plugins/deno/`    | `@ggpwnkthx/esbuild-plugin-deno`                                                   |
| `packages/plugins/css/`     | `@ggpwnkthx/esbuild-plugin-css`                                                    |
| `packages/wrappers/shared/` | `@ggpwnkthx/esbuild-wrapper-shared`                                                |
| `packages/wrappers/hono/`   | `@ggpwnkthx/esbuild-wrapper-hono`                                                  |
| `packages/wrappers/oak/`    | `@ggpwnkthx/esbuild-wrapper-oak`                                                   |
| `scripts/`                  | Workspace tooling for building esbuild release assets (root `deno task bin:build`) |

Source for each package lives at `mod.ts` (and `wasm.ts` for `esbuild`); internal helpers live under
`shared/` or `transpilers/`. Tests live under `tests/` and use `@std/assert`.

## Permissions

Typical development and test workflows may require:

- `--allow-read`
- `--allow-write`
- `--allow-net`
- `--allow-env`
- `--allow-run`

Each package's `deno task test` already passes the right flags. `deno task ci` runs check/lint/fmt
without runtime permissions.

## Development Commands

```bash
# Run the full CI ladder (fmt --check, lint, check) across the workspace
deno task ci

# Run the same ladder plus tests for a single package
cd packages/esbuild
deno task ci

# Run a single test file
deno test --allow-read --allow-write --allow-env --allow-net --allow-run \
  packages/wrappers/hono/tests/default.test.ts

# Format the whole workspace
deno fmt
```

The `bin:build` task (root only) needs read/write/env access plus `git` and `go` on the run
permission list:

```bash
deno task bin:build
```

## Contribution Guidelines

### Bug Fixes

- Add or update tests that fail before the fix and pass after it.
- Prefer the smallest change that fixes the issue cleanly.
- Preserve existing public API behavior unless a breaking change is intentional and documented in
  the affected package's `CHANGELOG.md` with a major version bump.

### New Features

- Open an issue or discussion first for substantial changes.
- Include tests.
- Update the relevant package `README.md` when public API changes.
- Keep dependencies minimal and prefer JSR.

### Memory-Sensitive Changes

Changes touching FFI, pointers, memory layout, resource lifecycle, or ABI-sensitive code need extra
care. For these changes:

- Explain the assumption clearly in the PR.
- Add focused tests for the affected types/paths.
- Call out risks around memory safety or resource management.

## Code Style

This project uses Deno's formatter and linter. The canonical settings are defined in the root
`deno.json`. `compilerOptions` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`) are inherited by every workspace member. Please run:

```bash
deno fmt
deno lint
```

before opening a PR.

A few expectations:

- Keep TypeScript strict.
- Avoid `any`.
- Prefer small, composable functions.
- Validate untrusted inputs early.
- Preserve typed errors and clear failure modes.
- Avoid unnecessary dependencies.

## Testing

Tests live under each package's `tests/` directory and use `@std/assert`. When adding tests:

- Use descriptive names.
- Keep fixtures minimal.
- Close resources explicitly when appropriate.
- Add regression coverage for reported bugs.

## Pull Requests

1. Create a branch from `main`.
2. Make your changes.
3. Add or update tests.
4. Update docs and the affected `CHANGELOG.md` if behavior changed. Per-package changes go to that
   package's `CHANGELOG.md`; workspace-level changes (root `deno.json`, CI, scripts, dev
   environment, release coordination) go to the root `CHANGELOG.md`.
5. Run `deno task ci` from the root and from the affected package(s).
6. Open a pull request with a clear description of: what changed, why it changed, and any
   compatibility or safety considerations.

## AI / LLM-Assisted Contributions

AI/LLM-generated code is allowed, but contributors are fully responsible for anything they submit.
If you use AI tools:

- Review, understand, and test all generated code before opening a PR.
- Ensure the code matches this project's style, safety, and version requirements.
- Do not submit code you cannot explain or maintain.
- Verify that generated code does not add unsafe dependencies, weaken validation, or change public
  behavior unintentionally.
- Avoid including secrets, private data, or unpublished code in AI tool prompts.

PRs may be rejected if AI-generated changes are low-quality, unreviewed, overly broad, or unsafe.

## Reporting Security Issues

Please do **not** open public issues for security-sensitive bugs. See `SECURITY.md` for
vulnerability reporting instructions.

## Questions

Open an issue for bugs or feature requests. For general questions, GitHub Discussions is the best
place to ask.
