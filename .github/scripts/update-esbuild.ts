#!/usr/bin/env -S deno run

/**
 * Update script for esbuild pins in deno.jsonc.
 * Reads current version from deno.jsonc imports, fetches latest from deno.land/x/esbuild,
 * and updates both URLs if a newer version is available.
 *
 * Outputs "updated" to stdout if a version bump was made.
 * Outputs "current" to stdout if already on latest.
 * Exits 0 on success, 1 on failure.
 */

const DENO_JSONC_PATH = "./deno.jsonc";
const ESBUILD_BASE_URL = "https://deno.land/x/esbuild";
const UPDATE_MSG = "updated";
const CURRENT_MSG = "current";

async function fetchLatestVersion(): Promise<string> {
  const response = await fetch(ESBUILD_BASE_URL, { redirect: "follow" });
  const url = response.url;
  const match = url.match(/@v(\d+\.\d+\.\d+)/);
  if (!match) {
    throw new Error(`Could not parse version from redirect URL: ${url}`);
  }
  return match[1];
}

async function updateDenoJsonc(
  currentVersion: string,
  newVersion: string,
): Promise<boolean> {
  let content = await Deno.readTextFile(DENO_JSONC_PATH);

  const oldModUrl = `${ESBUILD_BASE_URL}@v${currentVersion}/mod.js`;
  const newModUrl = `${ESBUILD_BASE_URL}@v${newVersion}/mod.js`;

  const oldWasmUrl = `${ESBUILD_BASE_URL}@v${currentVersion}/wasm.js`;
  const newWasmUrl = `${ESBUILD_BASE_URL}@v${newVersion}/wasm.js`;

  if (!content.includes(oldModUrl) || !content.includes(oldWasmUrl)) {
    return false;
  }

  content = content.replace(oldModUrl, newModUrl).replace(oldWasmUrl, newWasmUrl);
  await Deno.writeTextFile(DENO_JSONC_PATH, content);
  return true;
}

async function getEsbuildVersionFromImports(): Promise<string | null> {
  const content = await Deno.readTextFile(DENO_JSONC_PATH);
  const match = content.match(
    /"esbuild":\s*"https:\/\/deno\.land\/x\/esbuild@v(\d+\.\d+\.\d+)\/mod\.js"/,
  );
  return match ? match[1] : null;
}

async function main(): Promise<void> {
  const currentVersion = await getEsbuildVersionFromImports();
  if (!currentVersion) {
    console.error("Could not find current esbuild version in deno.jsonc");
    Deno.exit(1);
  }

  console.error(`Current esbuild version: ${currentVersion}`);

  const latestVersion = await fetchLatestVersion();
  console.error(`Latest esbuild version: ${latestVersion}`);

  if (currentVersion === latestVersion) {
    console.log(CURRENT_MSG);
    Deno.exit(0);
  }

  console.error(`Updating from ${currentVersion} to ${latestVersion}...`);
  const success = await updateDenoJsonc(currentVersion, latestVersion);

  if (!success) {
    console.error("Failed to update deno.jsonc");
    Deno.exit(1);
  }

  console.log(UPDATE_MSG);
  Deno.exit(0);
}

main();
