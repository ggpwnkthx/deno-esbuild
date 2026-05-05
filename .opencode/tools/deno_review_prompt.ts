import { tool } from "@opencode-ai/plugin";

import { collectChangedFilesDetailed } from "../lib/git.ts";
import {
  buildProjectReviewPrompt,
  selectProjectContextFiles,
} from "../lib/project.ts";

export default tool({
  description:
    "Build a strict project-level review prompt for the current changed files without auto-submitting it.",
  args: {
    maxFiles: tool.schema
      .number()
      .int()
      .min(1)
      .max(24)
      .default(8)
      .describe("Maximum number of changed files to reference directly"),
  },
  async execute(args, context) {
    const result = await collectChangedFilesDetailed(context);
    const reviewFiles = selectProjectContextFiles(
      result.files,
      [],
      args.maxFiles,
    );
    const prompt = buildProjectReviewPrompt(result.files, reviewFiles);

    const warnings = result.warnings.length > 0
      ? [
        "## Git discovery warnings",
        ...result.warnings.map((warning) => `- ${warning}`),
        "",
      ].join("\n")
      : "";

    return `${warnings}${prompt}`;
  },
});
