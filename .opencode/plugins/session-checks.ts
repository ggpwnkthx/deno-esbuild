import type { Plugin } from "@opencode-ai/plugin";

import {
  commandReport,
  formatCommand,
  runCommand,
} from "../lib/runtime.ts";
import { collectChangedFiles } from "../lib/git.ts";
import {
  chooseRelatedTests,
  runSelectedTests,
  scanTestFiles,
} from "../lib/tests.ts";

type LogLevel = "debug" | "info" | "warn" | "error";

interface StepSummary {
  readonly command: readonly string[];
  readonly exitCode: number;
}

const CHECK_COMMANDS = [
  ["deno", "fmt", "--check"],
  ["deno", "lint"],
  ["deno", "check"],
] as const;

export const SessionChecksPlugin: Plugin = async (
  { client, directory, worktree },
) => {
  let changed = false;
  let running = false;

  const idleChecksEnabled = process.env.OPENCODE_IDLE_CHECKS === "1";
  const autoSubmitCheckFailures =
    process.env.OPENCODE_AUTO_SUBMIT_CHECK_FAILURES === "1";

  const log = async (
    level: LogLevel,
    message: string,
    extra?: Record<string, unknown>,
  ) => {
    await client.app.log({
      body: {
        service: "session-checks",
        level,
        message,
        extra,
      },
    });
  };

  const runChecks = async () => {
    if (!idleChecksEnabled) {
      await log("debug", "Idle session checks disabled");
      return;
    }

    if (running) return;
    running = true;

    try {
      const context = { directory, worktree };
      const changedFiles = await collectChangedFiles(context);

      if (changedFiles.length === 0) {
        await log("debug", "No changed files found; skipping session checks");
        return;
      }

      const reports: string[] = [];
      const summaries: StepSummary[] = [];
      let failed = false;

      for (const command of CHECK_COMMANDS) {
        const result = await runCommand(context, command, { cwd: worktree });
        summaries.push({ command, exitCode: result.exitCode });
        if (result.exitCode !== 0) failed = true;
        reports.push(
          `## ${formatCommand(command)}\n\n${commandReport(result, 4_000)}`,
        );
      }

      const allTests = await scanTestFiles(context);
      const selection = chooseRelatedTests(changedFiles, allTests, 12);
      let testReport = [
        "## Related test selection",
        "",
        `Changed files: ${selection.changedFiles.length}`,
        `Indexed tests: ${allTests.length}`,
        `Selected tests: ${selection.relatedTests.length}`,
        `Reason: ${selection.reason}`,
        "",
        selection.relatedTests.length > 0
          ? selection.relatedTests.map((file) => `- ${file}`).join("\n")
          : "- No related tests found.",
      ].join("\n");

      if (selection.relatedTests.length > 0) {
        const resultText = await runSelectedTests(
          context,
          selection.relatedTests,
          {
            allowAll: true,
          },
        );
        testReport += `\n\n## deno test related files\n\n${resultText}`;
        if (/^Exit code:\s*[1-9]/m.test(resultText)) failed = true;
      }

      reports.push(testReport);

      if (!failed) {
        await log("info", "Deno session checks passed", {
          changedFilesCount: changedFiles.length,
          checks: summaries.map((item) => ({
            command: formatCommand(item.command),
            exitCode: item.exitCode,
          })),
          selectedTests: selection.relatedTests,
        });
        return;
      }

      await client.tui.appendPrompt({
        body: {
          text: buildFailurePrompt(reports),
        },
      });

      if (autoSubmitCheckFailures) {
        await client.tui.submitPrompt();
      }

      await log(
        "error",
        autoSubmitCheckFailures
          ? "Submitted Deno session check failure prompt"
          : "Prepared Deno session check failure prompt",
        {
          changedFilesCount: changedFiles.length,
          checks: summaries.map((item) => ({
            command: formatCommand(item.command),
            exitCode: item.exitCode,
          })),
          selectedTests: selection.relatedTests,
          autoSubmitCheckFailures,
        },
      );
    } catch (error) {
      await log("error", "Failed to execute Deno session checks", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };

  return {
    event: async ({ event }) => {
      if (event.type === "file.edited") {
        changed = true;
      }

      if (event.type === "session.idle" && changed) {
        changed = false;
        await runChecks();
      }
    },
  };
};

function buildFailurePrompt(reports: readonly string[]): string {
  return [
    "The automated Deno checks failed after the latest edits.",
    "",
    "Route verification triage through @deno-release-manager. Pull in @deno-test-strategist if the failure implies missing or unclear test proof.",
    "",
    "Fix the smallest root cause before making unrelated changes.",
    "",
    ...reports,
    "",
    "## Instructions",
    "- Prefer minimal, root-cause fixes.",
    "- Keep the target repository Deno-first.",
    "- Do not add Node/npm workarounds.",
    "- Do not claim checks passed until they actually pass.",
  ].join("\n");
}
