import type { Plugin } from "@opencode-ai/plugin";

import { getStringArg } from "../lib/command-policy.ts";
import { looksLikeSecretShellRead, looksSecret } from "../lib/secret-policy.ts";

type LogLevel = "debug" | "info" | "warn" | "error";

export const SecretGuardPlugin: Plugin = async ({ client }) => {
  const log = async (
    level: LogLevel,
    message: string,
    extra?: Record<string, unknown>,
  ) => {
    await client.app.log({
      body: {
        service: "secret-guard",
        level,
        message,
        extra,
      },
    });
  };

  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "read") {
        const filePath = getStringArg(output.args, "filePath") ??
          getStringArg(output.args, "path");

        if (!filePath) return;

        if (looksSecret(filePath)) {
          await log("warn", "Blocked secret file read", { filePath });
          throw new Error(`Refusing to read sensitive file: ${filePath}`);
        }

        return;
      }

      if (input.tool === "bash") {
        const command = getStringArg(output.args, "command");
        if (!command) return;

        if (looksLikeSecretShellRead(command)) {
          await log("warn", "Blocked shell access to likely secret material", {
            command,
          });
          throw new Error(
            "Refusing shell command that appears to read secret material.",
          );
        }
      }
    },
  };
};
