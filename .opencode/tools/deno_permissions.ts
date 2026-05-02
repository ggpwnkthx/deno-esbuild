import { tool } from "@opencode-ai/plugin";

import {
  analyzeDenoPermissionNeeds,
  formatPermissionFlags,
} from "../lib/permissions.ts";

export default tool({
  description:
    "Heuristically recommend a minimal set of Deno permission flags for a described capability or command.",
  args: {
    command: tool.schema
      .string()
      .min(1)
      .describe(
        "The command, code snippet, or capability description to analyze",
      ),
  },
  async execute(args) {
    const analysis = analyzeDenoPermissionNeeds(args.command);
    const flags = formatPermissionFlags(analysis);

    return [
      "### Recommended flags",
      flags.length > 0
        ? flags.map((flag) => `- ${flag}`).join("\n")
        : "- No elevated permissions inferred from the input.",
      "",
      "### Notes",
      analysis.read.length > 0
        ? `- Read access inferred: ${analysis.read.join(", ")}`
        : "- No read access inferred.",
      analysis.write.length > 0
        ? `- Write access inferred: ${analysis.write.join(", ")}`
        : "- No write access inferred.",
      analysis.net.length > 0
        ? `- Network access inferred: ${analysis.net.join(", ")}`
        : "- No network access inferred.",
      analysis.env.length > 0
        ? `- Environment access inferred: ${analysis.env.join(", ")}`
        : "- No environment access inferred.",
      analysis.sys
        ? "- System information access may be needed."
        : "- No system information access inferred.",
      analysis.ffi
        ? "- FFI access may be needed."
        : "- No FFI access inferred.",
      analysis.run
        ? "- Subprocess execution may be needed."
        : "- No subprocess execution inferred.",
      analysis.hrtime
        ? "- High-resolution time access may be needed."
        : "- No high-resolution time access inferred.",
      "",
      "### Reminder",
      "- Narrow placeholder scopes like <path>, <host>, and <name> to the smallest real values before running the command.",
    ].join("\n");
  },
});
