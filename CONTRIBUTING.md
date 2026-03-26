# Contributions

Thanks for your interest in contributing.

## Before You Start

Please read the README first for an overview of this library.

## Development Setup

1. Fork and clone the repository
2. Ensure you are using a compatible Deno version (see README for requirements)
3. Cache dependencies:

```bash
deno cache ./src/mod.ts
```

## Permissions

Typical development and test workflows may require:

- `--allow-read`
- `--allow-write`
- `--allow-net`
- `--allow-env`
- `--allow-ffi`

Refer to the README or documentation for specific permission requirements.

Most repository tasks already pass the necessary flags where applicable.

## Development Commands

```bash
# Run all checks used in CI
deno task ci

# Run tests
deno task test

# Run a specific test file
deno test -A ./tests/path/to/test.ts

# Type-check the public entrypoint
deno check ./src/mod.ts

# Lint
deno lint

# Format
deno fmt

# Run benchmarks
deno task bench
```

## Project Structure

- `src/` - source code
- `src/core/` - internal shared helpers, config, validation
- `tests/` - test suite

## Contribution Guidelines

### Bug Fixes

- Add or update tests that fail before the fix and pass after it
- Prefer the smallest change that fixes the issue cleanly
- Preserve existing public API behavior unless a breaking change is intentional

### New Features

- Open an issue or discussion first for substantial changes
- Include tests
- Update README and examples when the public API changes
- Keep dependencies minimal

### Memory-Sensitive Changes

Changes touching FFI, pointers, memory layout, resource lifecycle, or ABI-sensitive code
need extra care.

For these changes:

- explain the assumption clearly in the PR
- add focused tests for the affected types/paths
- call out risks around memory safety or resource management

## Code Style

This project uses Deno's formatter and linter. The canonical settings are defined in
`deno.jsonc`.

Please run:

```bash
deno fmt
deno lint
```

before opening a PR.

A few expectations:

- keep TypeScript strict
- avoid `any`
- prefer small, composable functions
- validate untrusted inputs early
- preserve typed errors and clear failure modes
- avoid unnecessary dependencies

## Testing

Tests live under `tests/` and use `@std/assert`.

When adding tests:

- use descriptive names
- keep fixtures minimal
- close resources explicitly when appropriate
- add regression coverage for reported bugs

## Pull Requests

1. Create a branch from `main`
2. Make your changes
3. Add or update tests
4. Update docs if behavior changed
5. Run `deno task ci`
6. Open a pull request with a clear description of:
   - what changed
   - why it changed
   - any compatibility or safety considerations

## AI / LLM-Assisted Contributions

AI/LLM-generated code is allowed, but contributors are fully responsible for anything they submit.

If you use AI tools:

- review, understand, and test all generated code before opening a PR
- ensure the code matches this project's style, safety, and version requirements
- do not submit code you cannot explain or maintain
- verify that generated code does not add unsafe dependencies, weaken validation, or change public behavior unintentionally
- avoid including secrets, private data, or unpublished code in AI tool prompts

PRs may be rejected if AI-generated changes are low-quality, unreviewed, overly broad, or unsafe.

## Reporting Security Issues

Please do **not** open public issues for security-sensitive bugs.

See `SECURITY.md` for vulnerability reporting instructions.

## Questions

Open an issue for bugs or feature requests.

For general questions, GitHub Discussions is the best place to ask.
