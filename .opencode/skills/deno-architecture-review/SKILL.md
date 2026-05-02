---
name: deno-architecture-review
description: Review Deno project structure, boundaries, modularity, duplication, and type ownership across routes, domain code, adapters, lib helpers, and tests.
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  runtime: deno
  category: review
---

## Checklist

1. Identify boundary layers:
   - transport/routes
   - domain logic
   - adapters/external clients
   - shared helpers
   - tests
2. Check misplaced responsibilities:
   - route handlers doing business logic
   - domain code reading env directly
   - helpers importing unrelated layers
   - tests depending on unstable internals
3. Find duplication and fractured ownership.
4. Check typed boundaries:
   - domain entities
   - config
   - external I/O
   - errors
5. Recommend incremental structure changes only when they simplify current code.

## Output

### Architecture summary

### What is working

### Boundary issues

### Suggested structure changes

### Type ownership gaps

### Next edits
