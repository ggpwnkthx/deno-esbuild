import type { Plugin } from "@opencode-ai/plugin";

import { joinPath } from "../lib/path.ts";

export const EnvInjectPlugin: Plugin = async ({ worktree }) => {
  return {
    "shell.env": async (input, output) => {
      output.env.CI = "1";
      output.env.NO_COLOR = "1";
      output.env.DENO_NO_UPDATE_CHECK = "1";
      output.env.DENO_DIR = joinPath(worktree, ".opencode", ".cache", "deno");
      output.env.OPENCODE_SHELL_CWD = input.cwd;
      output.env.OPENCODE_TARGET_RUNTIME = "deno";
      output.env.OPENCODE_HOST_RUNTIME = "bun";
    },
  };
};
