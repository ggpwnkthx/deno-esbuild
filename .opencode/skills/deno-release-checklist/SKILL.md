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

- `deno fmt --check`
- `deno lint`
- `deno check`
- smallest useful test set
- broader tests when risk is high

## Dependency sanity

- new imports justified
- pinned external imports
- no accidental Node/npm workflow drift
- permission impact understood

## Operational review

- config/env documented
- new files/directories intentional
- errors/logs actionable
- large-input behavior considered
- tests cover risky failure modes

## Output

### Release readiness

- Ready / Needs work

### Checks run

### Risks to resolve

### Permission notes

### Merge or release recommendation
