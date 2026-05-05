---
name: deno-dependency-policy
description: Enforce Deno-first dependency conventions: prefer built-ins, pinned jsr imports, minimal dependency weight, and avoid accidental Node/npm drift.
  license: MIT
  compatibility: opencode
  metadata:
    audience: maintainers
    runtime: deno
    category: policy
---

## Rules

1. Prefer Deno and Web built-ins before third-party packages.
2. Prefer small focused `jsr:` packages.
3. Pin external package versions.
4. Avoid Node-only APIs in target-repo app code unless the repo explicitly chose
   Node compatibility.
5. Avoid mixing dependency sources without a clear reason.
6. Flag dependencies that widen permissions.
7. Reject dependencies that duplicate simple local code.

## Output

### Dependency decisions

- one bullet per dependency or import

### Policy violations

- concrete bullets

### Safer alternatives

- concrete replacements

### Recommended edits

- short actionable list
