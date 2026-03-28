/**
 * esbuild binary installation and caching
 *
 * Handles downloading, caching, and path resolution for the native esbuild binary
 * across supported platforms (Linux, macOS, Windows, FreeBSD, Android).
 *
 * @example
 * ```typescript
 * import { install } from "@ggpwnkthx/esbuild/install";
 * const binaryPath = await install();
 * ```
 *
 * @module
 */
const NPM_REGISTRY = "https://registry.npmjs.org";

let cachedVersion: string | null = null;

/**
 * Fetches the latest version of esbuild from the npm registry.
 *
 * @returns The latest esbuild version string (e.g., "0.24.0")
 * @throws Error if the npm registry request fails
 */
export async function getLatestVersion(): Promise<string> {
  const res = await fetch(`${NPM_REGISTRY}/@esbuild/linux-x64`);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch esbuild version from npm: ${res.status} ${res.statusText}`,
    );
  }
  const data = await res.json();
  return data["dist-tags"].latest;
}

/**
 * Gets the cached esbuild version, fetching from npm if not yet cached.
 *
 * The version is cached after the first call to avoid repeated network requests.
 *
 * @returns The esbuild version string
 */
export async function getModVersion(): Promise<string> {
  if (cachedVersion !== null) return cachedVersion;
  cachedVersion = await getLatestVersion();
  return cachedVersion;
}

/**
 * Returns the cached esbuild version synchronously.
 *
 * @returns The cached esbuild version string
 * @throws Error if the version has not been initialized via `getModVersion()`
 */
export function getVersion(): string {
  if (cachedVersion === null) {
    throw new Error("Version not yet initialized. Call getModVersion() first.");
  }
  return cachedVersion;
}

/**
 * Downloads and installs an npm package, extracting the specified file.
 *
 * The package is downloaded from the npm registry (or custom registry via
 * NPM_CONFIG_REGISTRY env var) and cached in the system cache directory.
 *
 * @param name - The npm package name (e.g., "@esbuild/linux-x64")
 * @param subpath - The path within the tarball to extract (e.g., "bin/esbuild")
 * @returns The absolute path to the extracted executable
 * @throws Error if the download or extraction fails
 */
export async function installFromNPM(name: string, subpath: string): Promise<string> {
  const version = await getModVersion();
  const { finalPath, finalDir } = getCachePath(name, version);
  try {
    await Deno.stat(finalPath);
    return finalPath;
  } catch {
    // Continue with installation
  }

  const npmRegistry = Deno.env.get("NPM_CONFIG_REGISTRY") || NPM_REGISTRY;
  const url = `${npmRegistry}/${name}/-/${
    name.replace("@esbuild/", "")
  }-${version}.tgz`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const buffer = await res.arrayBuffer();
  const executable = await extractFileFromTarGzip(new Uint8Array(buffer), subpath);
  await Deno.mkdir(finalDir, {
    recursive: true,
    mode: 448,
  });
  await Deno.writeFile(finalPath, executable, { mode: 493 });
  return finalPath;
}

/**
 * Computes the cache directory path for an esbuild binary.
 *
 * The cache location follows platform conventions:
 * - macOS: ~/Library/Caches/esbuild/bin
 * - Windows: %LOCALAPPDATA%\\Cache\\esbuild\\bin or %USERPROFILE%\\AppData\\Local\\Cache\\esbuild\\bin
 * - Linux: $XDG_CACHE_HOME/esbuild/bin or ~/.cache/esbuild/bin
 *
 * @param name - The package name (e.g., "@esbuild/linux-x64")
 * @param version - The version string. If omitted, uses the cached version via `getVersion()`
 * @returns An object containing `finalPath` (full path to binary) and `finalDir` (directory path)
 * @throws Error if no cache directory can be determined
 */
export function getCachePath(
  name: string,
  version?: string,
): { finalPath: string; finalDir: string } {
  const ver = version ?? getVersion();
  let baseDir: string | undefined;
  switch (Deno.build.os) {
    case "darwin":
      baseDir = Deno.env.get("HOME");
      if (baseDir) baseDir += "/Library/Caches";
      break;
    case "windows":
      baseDir = Deno.env.get("LOCALAPPDATA");
      if (!baseDir) {
        baseDir = Deno.env.get("USERPROFILE");
        if (baseDir) baseDir += "/AppData/Local";
      }
      if (baseDir) baseDir += "/Cache";
      break;
    case "linux": {
      const xdg = Deno.env.get("XDG_CACHE_HOME");
      if (xdg && xdg[0] === "/") baseDir = xdg;
      break;
    }
  }

  if (!baseDir) {
    baseDir = Deno.env.get("HOME");
    if (baseDir) baseDir += "/.cache";
  }

  if (!baseDir) throw new Error("Failed to find cache directory");

  const finalDir = baseDir + `/esbuild/bin`;
  const finalPath = finalDir + `/${name.replace("/", "-")}@${ver}`;
  return { finalPath, finalDir };
}

/**
 * Extracts a file from a gzip-compressed tar archive.
 *
 * @param buffer - The compressed tar.gz archive as a Uint8Array
 * @param file - The filename to extract from the archive (without "package/" prefix)
 * @returns The raw bytes of the extracted file
 * @throws Error if the archive is invalid or the file is not found
 */
export async function extractFileFromTarGzip(
  compressed: Uint8Array,
  file: string,
): Promise<Uint8Array> {
  let buffer: Uint8Array;

  try {
    const decompressedStream = new Blob([compressed.buffer as ArrayBuffer])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));

    const decompressed = await new Response(decompressedStream).arrayBuffer();
    buffer = new Uint8Array(decompressed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid gzip data in archive: ${message}`);
  }

  const str = (i: number, n: number): string =>
    String.fromCharCode(...buffer.subarray(i, i + n)).replace(/\0.*$/, "");

  let offset = 0;
  const target = `package/${file}`;

  while (offset + 512 <= buffer.length) {
    const name = str(offset, 100);
    if (name === "") {
      break;
    }

    const size = parseInt(str(offset + 124, 12), 8);
    offset += 512;

    if (!Number.isNaN(size)) {
      if (name === target) {
        return buffer.subarray(offset, offset + size);
      }
      offset += (size + 511) & ~511;
    }
  }

  throw new Error(`Could not find ${JSON.stringify(target)} in archive`);
}

/**
 * Installs the esbuild binary for the current platform.
 *
 * If the `ESBUILD_BINARY_PATH` environment variable is set, it returns that path
 * instead of downloading. Otherwise, downloads and caches the appropriate binary
 * from npm based on the current platform (OS and architecture).
 *
 * Supported platforms: macOS (x64, ARM64), Linux (x64, ARM64, FreeBSD, Alpine),
 * Windows (x64), and Android (ARM64).
 *
 * @returns The absolute path to the esbuild binary
 * @throws Error if running on an unsupported platform
 */
export async function install(): Promise<string> {
  const overridePath = Deno.env.get("ESBUILD_BINARY_PATH");
  if (overridePath) return overridePath;

  const platformKey = Deno.build.target;
  const knownWindowsPackages: Record<string, string> = {
    "x86_64-pc-windows-msvc": "@esbuild/win32-x64",
  };
  const knownUnixlikePackages: Record<string, string> = {
    "aarch64-apple-darwin": "@esbuild/darwin-arm64",
    "aarch64-unknown-linux-gnu": "@esbuild/linux-arm64",
    "x86_64-apple-darwin": "@esbuild/darwin-x64",
    "x86_64-unknown-linux-gnu": "@esbuild/linux-x64",
    "aarch64-linux-android": "@esbuild/android-arm64",
    "x86_64-unknown-freebsd": "@esbuild/freebsd-x64",
    "x86_64-alpine-linux-musl": "@esbuild/linux-x64",
  };

  if (platformKey in knownWindowsPackages) {
    return await installFromNPM(
      knownWindowsPackages[platformKey],
      "esbuild.exe",
    );
  } else if (platformKey in knownUnixlikePackages) {
    return await installFromNPM(
      knownUnixlikePackages[platformKey],
      "bin/esbuild",
    );
  } else {
    throw new Error(`Unsupported platform: ${platformKey}`);
  }
}
