---
name: deno-test-strategy
description: Decide the smallest convincing Deno verification plan for a change: focused tests, regression cases, permission checks, and broad checks when warranted.
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  runtime: deno
  category: testing
---

## What I do

Map changed behavior to proof.

## Checklist

1. Identify the behavior that changed.
2. Identify what would fail if the change regressed.
3. Prefer focused tests before broad suites.
4. Require negative/boundary tests for validation, auth, parsing, retry, and error behavior.
5. Require permission checks when filesystem/network/env/run access changes.
6. Use broad checks only when scope/risk justifies it.

## Output

### Behavior under test

### Existing tests to run

### Tests to add

### Commands

### Remaining proof gap
