import { dirname, join as joinPath } from "@std/path";
import { MAX, WASM, WASM_RELPATH } from "./constants.ts";
import { CliError } from "./errors.ts";
import { relPath } from "./makefile.ts";
import { run } from "./process.ts";
import { type Built, type Def } from "./types.ts";

export async function buildOne(
  repo: string,
  tmp: string,
  pkg: string,
  d: Def,
): Promise<Built> {
  if (d.kind === "wasm") {
    const src = joinPath(tmp, WASM);

    console.log("Building wasm (js/wasm)");
    await go(repo, src, "js", "wasm");
    await ok(src, "wasm");

    const dst = joinPath(pkg, WASM_RELPATH);
    await Deno.mkdir(dirname(dst), { recursive: true });
    await Deno.copyFile(src, dst);

    return { def: d, src, rel: WASM_RELPATH };
  }

  const dir = joinPath(tmp, d.slug);
  const src = joinPath(dir, d.exe);

  await Deno.mkdir(dir, { recursive: true });

  console.log(`Building ${d.slug} (${d.goos}/${d.goarch})`);
  await go(repo, src, d.goos, d.goarch);
  await ok(src, d.slug);

  return { def: d, src, rel: relPath(d) };
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
  if (!s.isFile) throw new CliError(`Go build did not produce a file: ${path}`);
  if (s.size > MAX) {
    throw new CliError(
      `Built artifact for ${slug} is ${s.size} bytes, which exceeds the configured per-file limit of ${MAX} bytes.`,
    );
  }
}
