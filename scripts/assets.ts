import { join as joinPath } from "@std/path";
import { REPO } from "./constants.ts";
import { CliError } from "./errors.ts";
import { assetName } from "./makefile.ts";
import { removeIfExists, sha256 } from "./process.ts";
import type { Built, Def, Entry, Manifest, WasmEntry } from "./types.ts";

const METADATA_FILES = [
  "manifest.json",
  "SHA256SUMS",
  "THIRD_PARTY_NOTICES.md",
  "RELEASE_NOTES.md",
] as const;

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

type FileEntry = {
  fileName: string;
  sha256: string;
  bytes: number;
};

export async function clean(
  out: string,
  selected: readonly Def[],
): Promise<void> {
  await Deno.mkdir(out, { recursive: true });

  const files = new Set<string>([
    ...selected.map(assetName),
    ...METADATA_FILES,
  ]);

  await Promise.all(
    [...files].map((fileName) => removeIfExists(joinPath(out, fileName))),
  );
}

export async function writeReleaseAssets(
  out: string,
  ver: string,
  tag: string,
  commit: string,
  built: readonly Built[],
): Promise<Manifest> {
  if (!built.length) throw new CliError("No artifacts were built.");

  await Deno.mkdir(out, { recursive: true });

  const seen = new Set<string>();
  const binaries: Entry[] = [];
  let wasm: WasmEntry | undefined;

  for (const b of built) {
    if (seen.has(b.fileName)) {
      throw new CliError(`Duplicate release asset name: ${b.fileName}`);
    }

    seen.add(b.fileName);

    const dst = joinPath(out, b.fileName);
    await Deno.copyFile(b.src, dst);

    if (b.def.kind === "native" && b.def.goos !== "windows") {
      await Deno.chmod(dst, 0o755);
    }

    const file = await fileEntry(dst, b.fileName);

    if (b.def.kind === "wasm") {
      wasm = file;
      continue;
    }

    const d = b.def;
    const denoTarget = TARGET[`${d.goos}/${d.goarch}`];

    binaries.push({
      kind: d.kind,
      ...(denoTarget ? { denoTarget } : {}),
      slug: d.slug,
      goos: d.goos,
      goarch: d.goarch,
      executableName: d.exe,
      fileName: file.fileName,
      sha256: file.sha256,
      bytes: file.bytes,
    });
  }

  binaries.sort((a, b) => a.slug.localeCompare(b.slug));

  const manifest: Manifest = {
    version: ver,
    esbuildVersion: ver,
    sourceRepository: REPO,
    sourceTag: tag,
    sourceCommit: commit,
    generatedAt: new Date().toISOString(),
    ...(wasm ? { wasm } : {}),
    binaries,
  };

  await writeManifest(out, manifest);
  await writeChecksums(out, manifest);
  await writeThirdPartyNotices(out, manifest);
  await writeReleaseNotes(out, manifest);

  return manifest;
}

async function fileEntry(path: string, fileName: string): Promise<FileEntry> {
  const s = await Deno.stat(path);

  if (!s.isFile) {
    throw new CliError(`Expected file at ${path}.`);
  }

  if (s.size === 0) {
    throw new CliError(`Refusing empty release asset: ${path}`);
  }

  return {
    fileName,
    sha256: await sha256(path),
    bytes: s.size,
  };
}

async function writeManifest(out: string, manifest: Manifest): Promise<void> {
  await Deno.writeTextFile(
    joinPath(out, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

async function writeChecksums(out: string, manifest: Manifest): Promise<void> {
  const entries = [
    ...(manifest.wasm ? [manifest.wasm] : []),
    ...manifest.binaries,
  ].sort((a, b) => a.fileName.localeCompare(b.fileName));

  const body = entries
    .map((entry) => `${entry.sha256}  ${entry.fileName}`)
    .join("\n");

  await Deno.writeTextFile(joinPath(out, "SHA256SUMS"), `${body}\n`);
}

async function writeThirdPartyNotices(
  out: string,
  manifest: Manifest,
): Promise<void> {
  await Deno.writeTextFile(
    joinPath(out, "THIRD_PARTY_NOTICES.md"),
    `# Third-party notices

These release assets include native binaries built from esbuild.

- Project: esbuild
- Version: ${manifest.esbuildVersion}
- Source repository: ${manifest.sourceRepository}
- Source tag: ${manifest.sourceTag}
- Source commit: ${manifest.sourceCommit}
- License: MIT

The esbuild source project is licensed under the MIT license.
`,
  );
}

async function writeReleaseNotes(
  out: string,
  manifest: Manifest,
): Promise<void> {
  const assets = [
    ...(manifest.wasm ? [manifest.wasm] : []),
    ...manifest.binaries,
  ].sort((a, b) => a.fileName.localeCompare(b.fileName));

  const assetLines = assets.map((asset) =>
    `- \`${asset.fileName}\` — ${asset.bytes} bytes, SHA-256 \`${asset.sha256}\``
  );

  await Deno.writeTextFile(
    joinPath(out, "RELEASE_NOTES.md"),
    `# esbuild ${manifest.esbuildVersion} binaries

Built from esbuild ${manifest.sourceTag}.

- Source commit: \`${manifest.sourceCommit}\`
- Generated at: ${manifest.generatedAt}
- Checksums: see \`SHA256SUMS\`
- Machine-readable metadata: see \`manifest.json\`

## Assets

${assetLines.join("\n")}
`,
  );
}
