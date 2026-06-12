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

export type Built = {
  def: Def;
  src: string;
  fileName: string;
};

export type Opt = {
  repo: string;
  out: string;
  version: string | null;
  platforms: string;
  wasm: boolean;
  list: boolean;
  clean: boolean;
};

export type GitTag = {
  tag: string;
  version: SemVer;
};

export type Parsed = {
  name: string;
  deps: string[];
  body: string;
};

export type Entry = {
  kind: "native" | "wasi";
  denoTarget?: string;
  slug: string;
  goos: string;
  goarch: string;
  executableName: string;
  fileName: string;
  sha256: string;
  bytes: number;
};

export type WasmEntry = {
  fileName: string;
  sha256: string;
  bytes: number;
};

export type Manifest = {
  version: string;
  esbuildVersion: string;
  sourceRepository: string;
  sourceTag: string;
  sourceCommit: string;
  generatedAt: string;
  wasm?: WasmEntry;
  binaries: Entry[];
};

export type CommandOpts = {
  cwd?: string;
  env?: Record<string, string>;
};
