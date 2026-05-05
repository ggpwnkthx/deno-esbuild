---
name: deno-performance-check
description: Review Deno code for memory safety, streaming opportunities, whole-payload reads, pagination gaps, and avoidable complexity.
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  runtime: deno
  category: performance
---

## Checklist

Look for:

- `await req.text()`, `await req.json()`, `Deno.readTextFile`, `response.text()`
  on large inputs
- unbounded arrays, maps, caches, queues, or buffering
- missing pagination, cursors, limits, batching, or streaming
- repeated filters/scans inside loops
- repeated JSON serialization
- eager loading before filtering
- O(n^2) behavior where maps/sets/indexes would work

## Output

### Risk summary

### Memory hot spots

### Complexity hot spots

### Better approaches

### Priority fixes
