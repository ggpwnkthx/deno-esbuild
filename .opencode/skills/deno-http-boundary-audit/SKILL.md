---
name: deno-http-boundary-audit
description: Audit Deno HTTP handlers for request validation, typed failures, response contracts, config parsing, and transport-domain boundaries.
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  runtime: deno
  category: api
---

## Checklist

1. Identify all untrusted input:
   - params
   - query
   - headers
   - cookies
   - body
   - env/config
2. Confirm validation happens before business logic.
3. Confirm transport data is converted into typed domain input.
4. Normalize expected errors:
   - validation
   - auth
   - not found
   - conflict
   - internal
5. Confirm stable response shapes and intentional status codes.
6. Check request-body behavior:
   - malformed JSON
   - duplicate body reads
   - whole-body reads where streaming is needed

## Output

### Boundary summary

### Validation gaps

### Error-shape gaps

### Response-contract issues

### Recommended edits
