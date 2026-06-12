import { dirname, join as joinPath } from "@std/path";
import { MAX, NAME, REPO, WASM_RELPATH } from "./constants.ts";
import { CliError } from "./errors.ts";
import { split } from "./makefile.ts";
import { isFile, removeIfExists, sha256 } from "./process.ts";
import { type Built, type Entry, type Manifest } from "./types.ts";

const TARGET: Record<string, string> = {
  "linux/amd64": "x86_64-unknown-linux-gnu",
  "linux/arm64": "aarch64-unknown-linux-gnu",
  "linux/386": "i686-unknown-linux-gnu",
  "linux/arm": "armv7-unknown-linux-gnueabihf",
  "darwin/amd64": "x86_64-apple-darwin",
  "darwin/arm64": "aarch64-apple-darwin",
  "windows/amd64": "x86_64-pc-windows-msvc",
  "windows/arm64": "aarch64-pc-windows-msvc",
  "windows/386": "i686-pc-windows-msvc",
};

export async function copyWasmExec(goRoot: string, pkg: string): Promise<void> {
  const src = joinPath(goRoot, "lib", "wasm", "wasm_exec.js");
  if (!await isFile(src)) {
    throw new CliError(`Expected a regular file at ${src}.`);
  }

  await Deno.mkdir(pkg, { recursive: true });
  await Deno.copyFile(src, joinPath(pkg, "wasm_exec.js"));
}

export async function writePkg(
  out: string,
  scope: string,
  ver: string,
  tag: string,
  commit: string,
  built: readonly Built[],
  slugs: readonly string[],
): Promise<Manifest> {
  if (!built.length) throw new CliError("No artifacts were built.");

  const pkg = joinPath(out, NAME);
  await Deno.mkdir(pkg, { recursive: true });
  await rmBins(pkg, slugs);

  const binaries: Entry[] = [];
  let wasm: Manifest["wasm"];

  for (const b of built) {
    if (b.def.kind === "wasm") {
      wasm = await fileEntry(joinPath(pkg, b.rel), b.rel);
      continue;
    }

    const d = b.def;
    const dst = joinPath(pkg, b.rel);
    await Deno.mkdir(dirname(dst), { recursive: true });
    await Deno.copyFile(b.src, dst);

    if (d.kind === "native" && d.goos !== "windows") {
      await Deno.chmod(dst, 0o755);
    }

    const f = await fileEntry(dst, b.rel);
    const denoTarget = TARGET[`${d.goos}/${d.goarch}`];

    binaries.push({
      ...(denoTarget ? { denoTarget } : {}),
      slug: d.slug,
      goos: d.goos,
      goarch: d.goarch,
      executableName: d.exe,
      executablePath: b.rel,
      sha256: f.sha256,
      bytes: f.bytes,
    });
  }

  const manifest: Manifest = {
    packageName: `${scope}/${NAME}`,
    directory: NAME,
    version: ver,
    esbuildVersion: ver,
    sourceRepository: REPO,
    sourceTag: tag,
    sourceCommit: commit,
    ...(wasm ? { wasm } : {}),
    binaries,
  };

  await Deno.writeTextFile(
    joinPath(pkg, "THIRD_PARTY_NOTICES.md"),
    `# Third-party notices

This package includes native binaries built from esbuild.

- Project: esbuild
- Version: ${ver}
- Source repository: ${REPO}
- Source tag: ${tag}
- Source commit: ${commit}
- License: MIT

The esbuild license is included in LICENSE.md.
`,
  );

  await Deno.writeTextFile(
    joinPath(pkg, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  return manifest;
}

async function fileEntry(
  path: string,
  rel: string,
): Promise<{ path: string; sha256: string; bytes: number }> {
  const s = await Deno.stat(path);
  if (!s.isFile) throw new CliError(`Expected file at ${path}.`);
  if (s.size > MAX) {
    throw new CliError(`Refusing ${path}: file is larger than ${MAX} bytes.`);
  }

  return { path: rel, sha256: await sha256(path), bytes: s.size };
}

export async function clean(
  pkg: string,
  slugs: readonly string[],
): Promise<void> {
  await rmBins(pkg, slugs);
  await Promise.all([
    WASM_RELPATH,
    "wasm_exec.js",
    "manifest.json",
    "THIRD_PARTY_NOTICES.md",
  ].map((x) => removeIfExists(joinPath(pkg, x))));
}

async function rmBins(pkg: string, slugs: readonly string[]): Promise<void> {
  for (const slug of slugs) {
    const { os, arch } = split(slug);
    await removeIfExists(joinPath(pkg, "bin", os, arch));
    await removeIfExists(joinPath(pkg, "bin", slug));
  }
}
