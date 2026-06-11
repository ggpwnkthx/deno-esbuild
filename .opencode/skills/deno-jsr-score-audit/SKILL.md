---
name: deno-jsr-score-audit
description: Audit Deno packages for JSR score readiness: documentation, public API docs, slow types, package config, runtime compatibility, publish exclusions, and provenance.
  license: MIT
  compatibility: opencode
  metadata:
    audience: maintainers
    runtime: deno
    category: release
---

# Deno JSR Score Audit

Use this for packages that are intended to publish to JSR or maintain a high JSR package score.

## Checklist

1. Package configuration:
   - `deno.json`, `deno.jsonc`, `jsr.json`, or `jsr.jsonc` exists.
   - `name`, `version`, and `exports` are present for publishable package members.
   - package metadata such as `license`, description/documentation pointers, and repository links
     are present when the project owns them.
   - local-only tooling, generated output, caches, secrets, fixtures, and `.opencode/` are excluded
     from publishing when they are not part of the package.

2. Documentation:
   - root `README.md` exists.
   - README contains a small install/import example and one real usage example.
   - every exported entrypoint has a top-level module JSDoc block with `@module`.
   - public functions, classes, interfaces, types, constants, and errors have JSDoc.
   - examples are copy-pasteable and use pinned or intended import specifiers.

3. Slow type prevention:
   - exported functions and methods have explicit return types.
   - exported variables/constants have explicit public annotations or stable `satisfies` shapes.
   - exported class fields and accessors have explicit public types.
   - public aliases do not expose deep inferred implementation types.
   - no publish path relies on `--allow-slow-types` except as a temporary, tracked escape hatch.

4. Runtime compatibility:
   - package page/runtime claims match actual APIs used by exports.
   - Deno-only APIs are documented as Deno-only or isolated behind optional adapters.
   - Node/Bun/browser compatibility is not claimed unless tests or examples prove it.
   - external imports are pinned `jsr:` specifiers unless the repo has a deliberate exception.

5. Verification:
   - `deno fmt --check`
   - `deno lint`
   - `deno check`
   - `deno test`
   - `deno doc --lint`
   - `deno publish --dry-run`
   - focused examples or smoke tests for README snippets when practical.

6. Provenance:
   - publish workflow uses GitHub Actions OIDC with `id-token: write`.
   - workflow publishes with `deno publish` or `jsr publish`.
   - token-based publishing is avoided for releases that should receive provenance.

## Output

### JSR score readiness

- Ready / Needs work / Not enough context

### Score-critical gaps

- blockers and major issues first

### Documentation gaps

- README, module docs, symbol docs, examples

### Slow type risks

- exact exported symbols or files

### Package metadata and publish-surface risks

- config, exports, exclusions, runtime claims

### Provenance and release evidence

- workflow state and commands run

### Minimal fix plan

1.
2.
3.
