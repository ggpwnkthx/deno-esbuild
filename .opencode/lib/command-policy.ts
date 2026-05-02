export type CommandPolicyDecision =
  | { readonly action: "allow" }
  | { readonly action: "block"; readonly message: string }
  | {
      readonly action: "rewrite";
      readonly replacement: string;
      readonly reason: string;
    };

const BLOCKED_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly message: string;
}> = [
  {
    pattern: /^\s*node(?:\s|$)/,
    message: "Do not use `node` directly for target-repo work. This OpenCode harness runs on Bun; target repo commands should prefer `deno task`, `deno run`, or a local OpenCode tool.",
  },
  {
    pattern: /^\s*(npm|pnpm|yarn)\s+(install|add|exec|dlx|create)(?:\s|$)/,
    message: "Do not install or execute target-repo dependencies with npm/pnpm/yarn. Prefer Deno built-ins, pinned `jsr:` imports, or explicit maintainer approval.",
  },
  {
    pattern: /^\s*npx(?:\s|$)/,
    message: "Do not use `npx` in this Deno-first repo. Prefer `deno task`, `deno run`, or a custom OpenCode tool.",
  },
  {
    pattern: /^\s*(ts-node|tsx)(?:\s|$)/,
    message: "Do not use ts-node/tsx for target-repo work. Prefer `deno run` or `deno task`.",
  },
  {
    pattern: /^\s*(jest|vitest)(?:\s|$)/,
    message: "Do not use Jest/Vitest directly in this Deno-first repo unless the repo explicitly owns that workflow. Prefer `deno test` or a Deno task.",
  },
  {
    pattern: /^\s*tsc(?!\s+--noEmit\s*$)(?:\s|$)/,
    message: "Do not use arbitrary `tsc` commands in this Deno-first repo. Prefer `deno check`.",
  },
];

export function evaluateShellCommand(command: string): CommandPolicyDecision {
  for (const rule of BLOCKED_PATTERNS) {
    if (rule.pattern.test(command)) {
      return {
        action: "block",
        message: rule.message,
      };
    }
  }

  const rewrite = rewriteCommand(command);
  return rewrite ?? { action: "allow" };
}

export function rewriteCommand(command: string): CommandPolicyDecision | null {
  const packageRun = command.match(
    /^\s*(npm|pnpm|yarn|bun)\s+run\s+([A-Za-z0-9:_-]+)(?<rest>.*)$/s,
  );
  if (packageRun) {
    return {
      action: "rewrite",
      replacement: `deno task ${packageRun[2]}${packageRun.groups?.rest ?? ""}`,
      reason: "Use `deno task` instead of package-manager scripts in Deno-first repos.",
    };
  }

  const packageTest = command.match(/^\s*(npm|pnpm|yarn|bun)\s+test(?<rest>.*)$/s);
  if (packageTest) {
    return {
      action: "rewrite",
      replacement: `deno test -A${packageTest.groups?.rest ?? ""}`,
      reason: "Use `deno test -A` instead of package-manager test commands in Deno-first repos.",
    };
  }

  const eslintBare = command.match(/^\s*eslint\s*$/s);
  if (eslintBare) {
    return {
      action: "rewrite",
      replacement: "deno lint",
      reason: "Prefer Deno's built-in linter in Deno-first repos.",
    };
  }

  const eslintDot = command.match(/^\s*eslint\s+\.\s*$/s);
  if (eslintDot) {
    return {
      action: "rewrite",
      replacement: "deno lint",
      reason: "Prefer Deno's built-in linter in Deno-first repos.",
    };
  }

  const prettier = command.match(/^\s*prettier(?<rest>.*)$/s);
  if (prettier) {
    const rest = prettier.groups?.rest ?? "";
    if (/\s--write\b/.test(rest)) {
      return {
        action: "block",
        message: "Do not rewrite `prettier --write` automatically because flags and globs are not always equivalent. Use `deno fmt` directly.",
      };
    }

    if (/\s--check\b/.test(rest)) {
      const cleaned = rest.replace(/\s--check\b/g, "");
      return {
        action: "rewrite",
        replacement: `deno fmt --check${cleaned}`,
        reason: "Prefer Deno's built-in formatter check in Deno-first repos.",
      };
    }

    if (/^\s*(\.|$)/.test(rest)) {
      return {
        action: "rewrite",
        replacement: "deno fmt",
        reason: "Prefer Deno's built-in formatter in Deno-first repos.",
      };
    }
  }

  if (/^\s*tsc\s+--noEmit\s*$/i.test(command)) {
    return {
      action: "rewrite",
      replacement: "deno check",
      reason: "Prefer Deno's built-in type checking in Deno-first repos.",
    };
  }

  return null;
}

export function getStringArg(args: unknown, key: string): string | null {
  if (!args || typeof args !== "object") return null;
  const value = (args as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}
