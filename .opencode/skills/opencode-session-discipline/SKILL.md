---
name: opencode-session-discipline
description: Guide Bun-hosted OpenCode sessions for Deno-first repositories: prefer local tools, read before edit, verify narrowly, and report honestly.
  license: MIT
  compatibility: opencode
  metadata:
    audience: contributors
    runtime: opencode
    category: workflow
---

## What I do

I guide the working style for this stack.

The OpenCode harness runs on Bun. The target repository is Deno-first.

## Rules

1. Read relevant files before editing.
2. Make the smallest coherent change set.
3. Prefer custom OpenCode tools before ad hoc shell:
   - `deno_task`
   - `deno_test_changed`
   - `deno_review_prompt`
   - `deno_info`
   - `deno_permissions`
4. Prefer `deno task`, `deno fmt`, `deno lint`, `deno check`, and `deno test`.
5. Avoid Node/npm/pnpm/yarn/npx target-repo workflows unless explicitly
   required.
6. Run focused verification first.
7. Broaden verification only when risk justifies it.
8. State exactly what was and was not verified.
9. Do not make unrelated cleanup.

## Final response template

### Changed

- bullets

### Verified

- bullets

### Remaining risk

- bullets only if real

### Next step

- one small step only when useful
