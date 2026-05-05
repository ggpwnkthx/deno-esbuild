# Harness tests

These tests are for the Bun-hosted OpenCode harness, not the target Deno
application.

Run from the repository root:

```bash
bun test .opencode/tests
```

They cover the high-risk pure policy modules:

- command rewriting/blocking
- secret read blocking
- cwd containment
- project/test selection helpers
