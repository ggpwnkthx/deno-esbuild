import { dirname, join as joinPath } from "@std/path";
import { CliError } from "./errors.ts";
import { assetName } from "./makefile.ts";
import { run } from "./process.ts";
import type { Built, Def } from "./types.ts";

export async function buildOne(
  repo: string,
  tmp: string,
  d: Def,
): Promise<Built> {
  const fileName = assetName(d);
  const src = joinPath(tmp, fileName);

  await Deno.mkdir(dirname(src), { recursive: true });

  if (d.kind === "wasm") {
    console.log("Building browser wasm (js/wasm)");
    await go(repo, src, "js", "wasm");
    await ok(src, "browser-wasm");

    return { def: d, src, fileName };
  }

  console.log(`Building ${d.slug} (${d.goos}/${d.goarch})`);
  await go(repo, src, d.goos, d.goarch);
  await ok(src, d.slug);

  return { def: d, src, fileName };
}

async function go(
  cwd: string,
  out: string,
  GOOS: string,
  GOARCH: string,
): Promise<void> {
  await run("go", [
    "build",
    "-trimpath",
    "-ldflags=-s -w -buildid=",
    "-buildvcs=false",
    "-o",
    out,
    "./cmd/esbuild",
  ], { cwd, env: { CGO_ENABLED: "0", GOOS, GOARCH } });
}

async function ok(path: string, slug: string): Promise<void> {
  const s = await Deno.stat(path);

  if (!s.isFile) {
    throw new CliError(`Go build did not produce a file: ${path}`);
  }

  if (s.size === 0) {
    throw new CliError(`Go build produced an empty artifact for ${slug}.`);
  }
}
