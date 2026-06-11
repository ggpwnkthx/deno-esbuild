---
name: deno-release-checklist
description: Run a Deno-focused pre-merge or pre-release checklist covering formatting, linting, type checks, tests, permissions, dependencies, and operator notes.
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  runtime: deno
  category: workflow
---

## Verification

- `deno_jsr_audit` for publishable JSR packages
- `deno fmt --check`
- `deno lint`
- `deno check`
- smallest useful test set
- broader tests when risk is high
- `deno doc --lint` for libraries and public packages
- `deno publish --dry-run` before JSR release or package-score claims

## Dependency sanity

- new imports justified
- pinned external `jsr:` imports unless there is a documented exception
- no accidental Node/npm workflow drift in target package code
- permission impact understood
- exported entrypoints do not rely on Node/Bun-only APIs unless compatibility claims allow it

## Operational review

- config/env documented
- new files/directories intentional
- errors/logs actionable
- large-input behavior considered
- tests cover risky failure modes
- README examples match real exports
- package config declares `name`, `version`, `exports`, and package metadata
- `.opencode/`, generated output, caches, and local-only files are not in the publish surface
- GitHub Actions provenance is present when the release should get JSR provenance

## Output

### Release readiness

- Ready / Needs work

### Checks run

### Risks to resolve

### JSR readiness

### Permission notes

### Merge or release recommendation
