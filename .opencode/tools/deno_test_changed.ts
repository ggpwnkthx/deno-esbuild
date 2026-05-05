import { tool } from "@opencode-ai/plugin";

import { runSelectedTests, selectChangedTests } from "../lib/tests.ts";

export default tool({
  description:
    "Find test files related to changed files in the git worktree, and optionally run them with deno test.",
  args: {
    maxFiles: tool.schema
      .number()
      .int()
      .min(1)
      .max(32)
      .default(12)
      .describe("Maximum number of related tests to return"),
    run: tool.schema
      .boolean()
      .default(false)
      .describe("Run the selected tests with deno test"),
    allowAll: tool.schema
      .boolean()
      .default(false)
      .describe(
        "Pass -A to deno test when the selected tests need full permissions",
      ),
  },
  async execute(args, context) {
    const selection = await selectChangedTests(context, args.maxFiles);

    if (!args.run) {
      return [
        `Changed files: ${selection.changedFiles.length}`,
        `Selected related tests: ${selection.relatedTests.length}`,
        `Reason: ${selection.reason}`,
        "",
        "### Related tests",
        selection.relatedTests.length > 0
          ? selection.relatedTests.map((file) => `- ${file}`).join("\n")
          : "- None",
      ].join("\n");
    }

    return runSelectedTests(context, selection.relatedTests, {
      allowAll: args.allowAll,
    });
  },
});
