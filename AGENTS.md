# AGENTS.md

This document provides guidance for AI agents operating in this repository.

## Project Overview

`@ggpwnkthx/esbuild` is a Deno-first wrapper around the native esbuild binary. It exposes an async API similar to esbuild's JavaScript API while handling binary installation, service lifecycle, packet-based communication, option validation, and plugin callback bridging.

Target: Deno v2.7+ only; no Node.js APIs.

## Build/Lint/Test Commands

```bash
deno task test         # Run all tests with coverage
deno task coverage     # Generate LCOV coverage report
deno task coverage:check  # Verify coverage thresholds
deno task fmt          # Format code
deno task fmt:check    # Check formatting without modifying
deno task lint         # Lint code (./src, ./tests)
deno task check        # Type-check public entrypoint
deno task ci           # Run all CI checks (fmt && lint --fix && check && test)
```

### Single Test Execution

```bash
# Run a specific test file
deno test -A ./tests/api.test.ts

# Run a specific test by name (uses regex)
deno test -A --filter "test name pattern" ./tests/

# Run with coverage for specific files
deno test -A --coverage=coverage ./tests/*
```

## Code Style Guidelines

### TypeScript

- **Strict mode always** - `strict: true` in deno.jsonc
- **Avoid `any`** - Use `unknown` + type narrowing instead
- **Prefer generics** over union types where appropriate
- Use `interface` for object shapes; `type` for unions, intersections, mapped types

### Imports

- Use jsr.io packages only; never `https://deno.land` imports
- Pin versions: `import { X } from "jsr:@scope/pkg@1.2.3";`
- Current deps: `@std/assert@^1`, `@std/fs@^1`, `@std/path@^1`, `@std/jsonc@^1`
- Sort imports: external → internal → relative

### Formatting (from deno.jsonc)

```json
{
  "lineWidth": 88, "indentWidth": 2, "useTabs": false, "semiColons": true,
  "singleQuote": false, "proseWrap": "preserve", "trailingCommas": "onlyMultiLine",
  "operatorPosition": "nextLine"
}
```

### Naming Conventions

- **Files**: kebab-case (`my-file.ts`)
- **Types/Interfaces**: PascalCase (`MyType`, `PluginBuild`)
- **Functions/Methods**: camelCase (`myFunction`)
- **Constants**: SCREAMING_SNAKE_CASE
- **Enums**: PascalCase with UPPER values

### Error Handling

- Use typed errors with clear messages
- Define error class hierarchy for different failure modes
- Fail fast with validation errors
- Never swallow errors silently

## Documentation Standards

Every public entrypoint (files in `exports` in `deno.jsonc`) must have a module doc:

```typescript
/**
 * esbuild Deno API
 *
 * @example
 * ```typescript
 * import { build } from "@ggpwnkthx/esbuild";
 * ```
 *
 * @module
 */
```

All exported functions, types, interfaces, classes, and constants must have JSDoc comments.

## Architecture

```
src/
├── mod.ts        # Public entry point (exports types + api)
├── api.ts        # Public async API and service bootstrap
├── install.ts    # Binary download, cache, platform mapping
├── types.ts      # Public TypeScript types
└── utils/
    ├── byte-buffer.ts    # Packet encoding/decoding
    ├── channel.ts        # Service channel and plugin bridge
    ├── codec.ts          # UTF-8 helpers, JSON parsing
    ├── flags.ts          # Option-to-flag conversion
    ├── misc.ts           # Error/message helpers
    └── validation.ts     # Runtime input validation
```

Memory safety: Stream large I/O with `AsyncIterable`, close resources explicitly with `using` or try/finally, document FFI hot spots.

## Testing Guidelines

Tests under `tests/` use `@std/assert` for assertions.

```typescript
import { assertEquals, assertRejects } from "@std/assert@^1";

Deno.test("build works correctly", async () => {
  const result = await build({ entryPoints: ["test.ts"] });
  assertEquals(result.errors.length, 0);
});

Deno.test("invalid options rejects", async () => {
  await assertRejects(() => build({ entryPoints: [] as any }));
});
```

## Git Conventions

- Commit messages: clear, descriptive, explain _why_ not just _what_
- Branch from `main`
- AI-generated code: contributors responsible for reviewing all generated code
- Do not commit secrets, .env files, or private data

## CI Workflow

GitHub Actions runs on Ubuntu with Deno 2.7.7:
```bash
deno task fmt && deno lint --fix && deno task check && deno task test
```
Coverage artifacts uploaded automatically.
