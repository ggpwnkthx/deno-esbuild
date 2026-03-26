import type { Plugin } from "@opencode-ai/plugin";

export const DenoEnforcePlugin: Plugin = async ({ $ }) => {
  let changed = false;
  let running = false;

  const runChecks = async () => {
    if (running) return;
    running = true;
    try {
      await $`deno lint`;
      await $`deno check`;
    } catch (err) {
      console.error("[opencode] Deno validation failed:", err);
    } finally {
      running = false;
    }
  };

  return {
    event: async ({ event }) => {
      if (event.type === "file.edited") {
        changed = true;
      }

      // Run once after opencode settles, instead of once per individual edit.
      if (event.type === "session.idle" && changed) {
        changed = false;
        await runChecks();
      }
    },
  };
};
