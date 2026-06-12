/**
 * @module
 * Shared helpers for the `@ggpwnkthx/esbuild` test suite.
 */
export const PACKAGE_DIR_URL: URL = new URL("..", import.meta.url);

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digestBytes: Uint8Array<ArrayBuffer> = new Uint8Array(bytes);
  const hash = await crypto.subtle.digest("SHA-256", digestBytes);
  return Array.from(
    new Uint8Array(hash),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function isLinux(): boolean {
  return Deno.build.os === "linux";
}

export async function readManifest(): Promise<{
  packageName: string;
  directory: string;
  version: string;
  esbuildVersion: string;
  sourceRepository: string;
  sourceTag: string;
  sourceCommit: string;
  wasm: { path: string; sha256: string; bytes: number };
  binaries: ReadonlyArray<{
    denoTarget?: string;
    slug: string;
    goos: string;
    goarch: string;
    executableName: string;
    executablePath: string;
    sha256: string;
    bytes: number;
  }>;
}> {
  const text = await Deno.readTextFile(
    new URL("../manifest.json", import.meta.url),
  );
  return JSON.parse(text);
}
