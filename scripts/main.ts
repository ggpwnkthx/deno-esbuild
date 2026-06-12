import { isAbsolute, join as joinPath, relative } from "@std/path";
import { clean, writeReleaseAssets } from "./assets.ts";
import { buildOne } from "./build.ts";
import { cli } from "./cli.ts";
import { CliError, CommandError } from "./errors.ts";
import { latest, normTag, repo } from "./git.ts";
import { assertDefs, defs, order, pick, plan } from "./makefile.ts";
import { isFile, removeIfExists, run, text } from "./process.ts";
import type { Built, Opt } from "./types.ts";

async function list(o: Opt): Promise<void> {
  const mf = joinPath(o.repo, "Makefile");

  if (!await isFile(mf)) {
    throw new CliError(
      `Cannot list build plan: Makefile not found at ${mf}.\nRun without --list to clone the esbuild repository and generate a Makefile first.`,
    );
  }

  const all = defs(mf);
  assertDefs(all);
  plan(pick(all, o.platforms, o.wasm), o.out);
}

function guard(out: string, repo: string): void {
  const repoFromOut = relative(out, repo);

  if (
    repoFromOut === "" ||
    repoFromOut === "." ||
    (!repoFromOut.startsWith("..") && !isAbsolute(repoFromOut))
  ) {
    throw new CliError(
      `Refusing to use an output directory that contains the esbuild repository.\noutDir: ${out}\nrepoDir: ${repo}\nChoose a different --out-dir or --repo-dir.`,
    );
  }
}

async function build(o: Opt): Promise<void> {
  guard(o.out, o.repo);

  await repo(o.repo);

  const tag = o.version === null ? await latest(o.repo) : normTag(o.version);
  await run("git", ["checkout", "--detach", tag], { cwd: o.repo });

  const ver = tag.slice(1);
  const commit = (await text("git", ["rev-parse", "HEAD"], {
    cwd: o.repo,
  })).trim();

  const all = defs(joinPath(o.repo, "Makefile"));
  assertDefs(all);

  const chosen = pick(all, o.platforms, o.wasm);

  if (!chosen.length) {
    throw new CliError(
      "No artifacts selected. Pass --platforms <list> or remove --no-wasm.",
    );
  }

  if (o.clean) {
    await clean(o.out, chosen);
  } else {
    await Deno.mkdir(o.out, { recursive: true });
  }

  const tmp = await Deno.makeTempDir({ prefix: `esbuild-${ver}-` });

  try {
    const built: Built[] = [];

    for (const d of order(chosen)) {
      built.push(await buildOne(o.repo, tmp, d));
    }

    const manifest = await writeReleaseAssets(o.out, ver, tag, commit, built);

    console.log(`Built esbuild ${ver} from ${tag} (${commit}).`);
    console.log(`Wrote release assets to ${o.out}:`);

    if (manifest.wasm) {
      console.log(`- wasm -> ${joinPath(o.out, manifest.wasm.fileName)}`);
    }

    for (const b of manifest.binaries) {
      console.log(`- ${b.slug} -> ${joinPath(o.out, b.fileName)}`);
    }

    console.log(`- manifest -> ${joinPath(o.out, "manifest.json")}`);
    console.log(`- checksums -> ${joinPath(o.out, "SHA256SUMS")}`);
  } finally {
    await removeIfExists(tmp);
  }
}

export async function main(args: readonly string[]): Promise<void> {
  try {
    const o = cli(args);

    if (o.list) await list(o);
    else await build(o);
  } catch (e: unknown) {
    console.error(
      e instanceof CliError || e instanceof CommandError
        ? e.message
        : e instanceof Error
        ? e.stack ?? e.message
        : String(e),
    );
    Deno.exit(1);
  }
}

if (import.meta.main) await main(Deno.args);
