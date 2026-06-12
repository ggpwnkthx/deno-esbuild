import type { SemVer } from "@std/semver";

export type Kind = "native" | "wasi" | "wasm";
export type Native = {
  kind: "native" | "wasi";
  slug: string;
  goos: string;
  goarch: string;
  exe: string;
};
export type Def = Native | { kind: "wasm" };
export type Built = { def: Def; src: string; rel: string };
export type Opt = {
  repo: string;
  out: string;
  scope: string;
  version: string | null;
  platforms: string;
  wasm: boolean;
  list: boolean;
  clean: boolean;
};
export type GitTag = { tag: string; version: SemVer };
export type Parsed = { name: string; deps: string[]; body: string };
export type Entry = {
  denoTarget?: string;
  slug: string;
  goos: string;
  goarch: string;
  executableName: string;
  executablePath: string;
  sha256: string;
  bytes: number;
};
export type Manifest = {
  packageName: string;
  directory: string;
  version: string;
  esbuildVersion: string;
  sourceRepository: string;
  sourceTag: string;
  sourceCommit: string;
  wasm?: { path: string; sha256: string; bytes: number };
  binaries: Entry[];
};
export type CommandOpts = { cwd?: string; env?: Record<string, string> };
