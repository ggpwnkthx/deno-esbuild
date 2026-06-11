import { tool } from "@opencode-ai/plugin";

import { runJsrPackageAudit } from "../lib/jsr.ts";

export default tool({
  description:
    "Audit the current Deno package for JSR score readiness: docs, exports, slow types, metadata, publish surface, and provenance.",
  args: {
    cwd: tool.schema
      .string()
      .optional()
      .describe("Optional relative package directory inside the worktree"),
  },
  async execute(args, context) {
    return await runJsrPackageAudit(context, {
      cwd: args.cwd,
    });
  },
});
