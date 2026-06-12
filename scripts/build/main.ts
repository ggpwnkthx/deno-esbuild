import { isAbsolute, join as joinPath, relative } from "@std/path";
import { buildOne } from "./build.ts";
import { cli } from "./cli.ts";
import { NAME } from "./constants.ts";
import { CliError, CommandError } from "./errors.ts";
import { latest, normTag, repo } from "./git.ts";
import { assertDefs, defs, order, pick, plan } from "./makefile.ts";
import { clean, copyWasmExec, writePkg } from "./packaging.ts";
import { isFile, removeIfExists, run, text } from "./process.ts";
import { type Built, type Opt } from "./types.ts";

async function list(o: Opt, pkg: string): Promise<void> {
  const mf = joinPath(o.repo, "Makefile");
  if (!await isFile(mf)) {
    throw new CliError(
      `Cannot list build plan: Makefile not found at ${mf}.\nRun without --list to clone the esbuild repository and generate a Makefile first.`,
    );
  }

  const all = defs(mf);
  assertDefs(all);
  plan(pick(all, o.platforms, o.wasm), pkg);
}

function guard(pkg: string, repo: string): void {
  const repoFromPkg = relative(pkg, repo);
  if (
    repoFromPkg === "" ||
    repoFromPkg === "." ||
    (!repoFromPkg.startsWith("..") && !isAbsolute(repoFromPkg))
  ) {
    throw new CliError(
      `Refusing to use a package output directory that contains the esbuild repository.\npackageDir: ${pkg}\nrepoDir: ${repo}\nChoose a different --out-dir or --repo-dir.`,
    );
  }
}

async function build(o: Opt, pkg: string): Promise<void> {
  guard(pkg, o.repo);
  await Deno.mkdir(o.out, { recursive: true });
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

  const slugs = all.flatMap((d) => d.kind === "wasm" ? [] : [d.slug]);
  if (o.clean) await clean(pkg, slugs);

  const tmp = await Deno.makeTempDir({ prefix: `esbuild-${ver}-` });

  try {
    const built: Built[] = [];
    for (const d of order(chosen)) {
      built.push(await buildOne(o.repo, tmp, pkg, d));
    }

    const goRoot = (await text("go", ["env", "GOROOT"], {})).trim();
    await copyWasmExec(goRoot, pkg);

    const manifest = await writePkg(
      o.out,
      o.scope,
      ver,
      tag,
      commit,
      built,
      slugs,
    );

    console.log(`Built esbuild ${ver} from ${tag} (${commit}).`);
    console.log(`Wrote unified JSR package ${manifest.packageName} to ${pkg}:`);
    for (const b of manifest.binaries) {
      console.log(`- ${b.slug} -> ${joinPath(pkg, b.executablePath)}`);
    }
    if (manifest.wasm) {
      console.log(`- wasm -> ${joinPath(pkg, manifest.wasm.path)}`);
    }
  } finally {
    await removeIfExists(tmp);
  }
}

export async function main(args: readonly string[]): Promise<void> {
  try {
    const o = cli(args);
    const pkg = joinPath(o.out, NAME);
    if (o.list) await list(o, pkg);
    else await build(o, pkg);
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
