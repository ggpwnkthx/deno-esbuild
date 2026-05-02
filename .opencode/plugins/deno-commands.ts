import type { Plugin } from "@opencode-ai/plugin";

import {
  evaluateShellCommand,
  getStringArg,
} from "../lib/command-policy.ts";

type LogLevel = "debug" | "info" | "warn" | "error";

export const DenoCommandsPlugin: Plugin = async ({ client }) => {
  const log = async (
    level: LogLevel,
    message: string,
    extra?: Record<string, unknown>,
  ) => {
    await client.app.log({
      body: {
        service: "deno-commands",
        level,
        message,
        extra,
      },
    });
  };

  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") return;

      const command = getStringArg(output.args, "command");
      if (!command) return;

      const decision = evaluateShellCommand(command);

      if (decision.action === "allow") return;

      if (decision.action === "block") {
        await log("warn", "Blocked non-Deno target-repo shell command", {
          command,
          message: decision.message,
        });
        throw new Error(decision.message);
      }

      output.args.command = decision.replacement;
      await log("info", "Rewrote target-repo shell command for Deno-first workflow", {
        from: command,
        to: decision.replacement,
        reason: decision.reason,
      });
    },
  };
};
