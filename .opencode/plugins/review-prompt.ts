import type { Plugin } from "@opencode-ai/plugin";

import { collectChangedFiles } from "../lib/git.ts";
import {
  buildProjectReviewPrompt,
  isReviewableFile,
  selectProjectContextFiles,
  suggestReviewAgents,
} from "../lib/project.ts";
import { normalizePath } from "../lib/path.ts";

const MAX_CONTEXT_FILES = 8;
const MAX_RECENT_FILES = 25;
const MIN_FILES_FOR_IDLE_REVIEW = 4;

type LogLevel = "debug" | "info" | "warn" | "error";

export const ReviewPromptPlugin: Plugin = async (
  { client, directory, worktree },
) => {
  let changed = false;
  let running = false;
  let recentlyEditedPaths: string[] = [];

  const autoSubmit = process.env.OPENCODE_AUTO_SUBMIT_REVIEW === "1";

  const log = async (
    level: LogLevel,
    message: string,
    extra?: Record<string, unknown>,
  ) => {
    await client.app.log({
      body: {
        service: "review-prompt",
        level,
        message,
        extra,
      },
    });
  };

  const maybePrepareReview = async () => {
    if (running) return;
    running = true;

    try {
      const changedFiles = await collectChangedFiles({ worktree, directory });
      if (changedFiles.length === 0) {
        await log("debug", "No changed files found for review");
        return;
      }

      if (!shouldPrepareIdleReview(changedFiles)) {
        await log("debug", "Changed files did not meet idle review threshold", {
          changedFilesCount: changedFiles.length,
        });
        return;
      }

      const reviewFiles = selectProjectContextFiles(
        changedFiles,
        recentlyEditedPaths,
        MAX_CONTEXT_FILES,
      );

      const prompt = buildProjectReviewPrompt(changedFiles, reviewFiles);

      await client.tui.appendPrompt({
        body: { text: prompt },
      });

      if (autoSubmit) {
        await client.tui.submitPrompt();
      }

      await log("info", autoSubmit ? "Submitted risk-triggered review prompt" : "Prepared risk-triggered review prompt", {
        changedFilesCount: changedFiles.length,
        reviewFiles,
        autoSubmit,
      });

      recentlyEditedPaths = [];
    } catch (error) {
      await log("error", "Failed to prepare project-level review prompt", {
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

        const editedPath = extractEditedPath(event);
        if (editedPath && isReviewableFile(editedPath)) {
          recentlyEditedPaths = pushRecentPath(
            recentlyEditedPaths,
            editedPath,
            MAX_RECENT_FILES,
          );
        }
      }

      if (event.type === "session.idle" && changed) {
        changed = false;
        await maybePrepareReview();
      }
    },
  };
};

function shouldPrepareIdleReview(changedFiles: readonly string[]): boolean {
  if (changedFiles.length >= MIN_FILES_FOR_IDLE_REVIEW) return true;
  return suggestReviewAgents(changedFiles).length >= 3;
}

function extractEditedPath(event: unknown): string | null {
  if (!event || typeof event !== "object") return null;

  const record = event as Record<string, unknown>;
  if (record.type !== "file.edited") return null;

  const properties = record.properties;
  if (!properties || typeof properties !== "object") return null;

  const file = (properties as Record<string, unknown>).file;
  return typeof file === "string" ? file : null;
}

function pushRecentPath(
  paths: readonly string[],
  path: string,
  maxItems: number,
): string[] {
  const normalized = normalizePath(path);
  const next = paths.filter((item) => item !== normalized);
  next.push(normalized);
  return next.slice(-maxItems);
}
