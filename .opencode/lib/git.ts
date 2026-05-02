import { runCommand, type RuntimeContext } from "./runtime.ts";
import { isReviewableFile } from "./project.ts";
import { normalizePath } from "./path.ts";

const CHANGE_COMMANDS = [
  ["git", "diff", "--name-only", "--diff-filter=ACMR"],
  ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"],
  ["git", "ls-files", "--others", "--exclude-standard"],
] as const;

export interface ChangedFileResult {
  readonly files: readonly string[];
  readonly warnings: readonly string[];
}

export async function collectChangedFiles(
  context: RuntimeContext,
): Promise<string[]> {
  return (await collectChangedFilesDetailed(context)).files.slice();
}

export async function collectChangedFilesDetailed(
  context: RuntimeContext,
): Promise<ChangedFileResult> {
  const files = new Set<string>();
  const warnings: string[] = [];

  for (const cmd of CHANGE_COMMANDS) {
    const result = await runCommand(context, cmd, { cwd: context.worktree });
    if (result.exitCode !== 0) {
      warnings.push(`${cmd.join(" ")} exited ${result.exitCode}: ${result.stderr.trim() || result.stdout.trim() || "no output"}`);
      continue;
    }

    for (const line of result.stdout.split(/\r?\n/)) {
      const file = normalizePath(line.trim());
      if (!file) continue;
      if (!isReviewableFile(file)) continue;
      files.add(file);
    }
  }

  return {
    files: [...files].sort((a, b) => a.localeCompare(b)),
    warnings,
  };
}
