---
name: critical-code-review
description: Rigorous, evidence-based code review focused on correctness, security, data model integrity, API ergonomics, performance, tests, and change scope.
license: MIT
compatibility: opencode
metadata:
  audience: engineers
  workflow: code-review
---

# Critical Code Review

Review code with high standards and low drama.

## Workflow

1. Establish the review target: diff, files, branch, PR-like change, or snippet.
2. State the intended behavior and important invariants.
3. Review in this order:
   - correctness
   - security/privacy/abuse resistance
   - data model and API design
   - concurrency/lifecycle/resources
   - simplicity/maintainability
   - performance
   - tests/proof
   - diff hygiene
4. Separate findings from taste.
5. Demand proof where it matters.
6. Recommend surgical fixes.

## Severity labels

- `blocker`: likely incorrect, unsafe, data-losing, security-sensitive, or
  public-contract breaking.
- `major`: likely bug, maintainability trap, important missing test, or risky
  design.
- `minor`: real issue with limited blast radius.
- `nit`: style/readability only.
- `question`: missing context that affects the review.

## Output

```markdown
## Verdict

[approve / approve with nits / request changes / needs more context]

## Highest-risk issues

- [severity] [file/function]: [specific problem]
  - Why it matters:
  - Evidence:
  - Fix:

## Detailed review

### Correctness

### Security and failure modes

### Data model and API design

### Simplicity and maintainability

### Tests and proof

### Diff hygiene

## Minimal fix plan

1.
2.
3.
```
