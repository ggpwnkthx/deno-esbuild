import { tool } from "@opencode-ai/plugin";

import { commandReport, runCommand } from "../lib/runtime.ts";

export default tool({
  description: "Run `deno info` for a specific file or module specifier.",
  args: {
    target: tool.schema
      .string()
      .min(1)
      .describe("A file path or module specifier"),
    json: tool.schema
      .boolean()
      .default(false)
      .describe("Whether to return JSON output from deno info"),
  },
  async execute(args, context) {
    if (/[\r\n\0]/.test(args.target)) {
      throw new Error("target may not contain control characters");
    }

    const command = ["deno", "info"];
    if (args.json) command.push("--json");
    command.push(args.target);

    const result = await runCommand(context, command, {
      cwd: context.worktree,
    });

    return commandReport(result, 16_000);
  },
});
