import { tool } from "@opencode-ai/plugin";

import { commandReport, runCommand } from "../lib/runtime.ts";

export default tool({
  description:
    "Run `deno cache` for explicit targets inside the current worktree.",
  args: {
    targets: tool.schema
      .array(tool.schema.string().min(1))
      .min(1)
      .max(24)
      .describe("Files or module specifiers to cache"),
    reload: tool.schema
      .boolean()
      .default(false)
      .describe("Whether to pass --reload"),
  },
  async execute(args, context) {
    for (const target of args.targets) {
      validateTarget(target);
    }

    const command = ["deno", "cache"];
    if (args.reload) command.push("--reload");
    command.push(...args.targets);

    const result = await runCommand(context, command, {
      cwd: context.worktree,
    });

    return commandReport(result);
  },
});

function validateTarget(target: string): void {
  if (/[\r\n\0]/.test(target)) {
    throw new Error("targets may not contain control characters");
  }
}
