import { dirname, join as joinPath } from "@std/path";
import { compare, format, type SemVer, tryParse } from "@std/semver";
import { REPO } from "./constants.ts";
import { CliError } from "./errors.ts";
import { isDirectory, run, text } from "./process.ts";
import type { GitTag } from "./types.ts";

export async function repo(dir: string): Promise<void> {
  if (await isDirectory(joinPath(dir, ".git"))) {
    console.log(`Updating esbuild repository at ${dir}`);
    await run("git", ["fetch", "--tags", "--prune", "origin"], { cwd: dir });
  } else {
    console.log(`Cloning esbuild repository into ${dir}`);
    await Deno.mkdir(dirname(dir), { recursive: true });
    await run("git", ["clone", REPO, dir], {});
    await run("git", ["fetch", "--tags", "--prune", "origin"], { cwd: dir });
  }
}

export async function latest(repo: string): Promise<string> {
  const tags = (await text("git", [
    "tag",
    "--list",
    "v[0-9]*.[0-9]*.[0-9]*",
  ], { cwd: repo }))
    .split(/\r?\n/)
    .map(gitTag)
    .filter((x): x is GitTag => x !== null)
    .sort((a, b) => compare(a.version, b.version));

  const tag = tags.at(-1);
  if (!tag) {
    throw new CliError(
      "Could not find any stable esbuild tags in the local git checkout.",
    );
  }

  return tag.tag;
}

export function normTag(v: string): string {
  const version = stableVersion(v);
  if (!version) {
    throw new CliError(
      `Invalid esbuild version "${v}". Expected a stable version like 0.28.1.`,
    );
  }
  return `v${format(version)}`;
}

function gitTag(tag: string): GitTag | null {
  const version = stableVersion(tag);
  return version ? { tag: `v${format(version)}`, version } : null;
}

function stableVersion(raw: string): SemVer | null {
  const version = tryParse(raw.trim().replace(/^v/, ""));
  return version && version.prerelease?.length === 0 &&
      version.build?.length === 0
    ? version
    : null;
}
