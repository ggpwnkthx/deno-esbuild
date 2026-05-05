import { tool } from "@opencode-ai/plugin";

import { commandReport, runCommand } from "../lib/runtime.ts";
import { resolveInside } from "../lib/path.ts";

export default tool({
  description:
    "Run an approved `deno task` inside the current project worktree.",
  args: {
    task: tool.schema.string().min(1).describe(
      "Task name from deno.json or deno.jsonc",
    ),
    extraArgs: tool.schema
      .array(tool.schema.string().min(1))
      .max(24)
      .default([])
      .describe("Additional task arguments"),
    cwd: tool.schema
      .string()
      .optional()
      .describe("Optional relative working directory inside the worktree"),
  },
  async execute(args, context) {
    const cwd = resolveInside(context.worktree, args.cwd);

    validateSafeToken(args.task, "task");
    for (const item of args.extraArgs) {
      validateSafeToken(item, "extraArgs");
    }

    const command = ["deno", "task", args.task, ...args.extraArgs];
    const result = await runCommand(context, command, { cwd });

    return commandReport(result);
  },
});

function validateSafeToken(value: string, fieldName: string): void {
  if (/[\r\n\0]/.test(value)) {
    throw new Error(`${fieldName} contains unsupported control characters`);
  }
}
