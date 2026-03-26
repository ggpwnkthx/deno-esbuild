const NPM_REGISTRY = "https://registry.npmjs.org";

let cachedVersion: string | null = null;

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

export async function getModVersion(): Promise<string> {
  if (cachedVersion !== null) return cachedVersion;
  cachedVersion = await getLatestVersion();
  return cachedVersion;
}

export function getVersion(): string {
  if (cachedVersion === null) {
    throw new Error("Version not yet initialized. Call getModVersion() first.");
  }
  return cachedVersion;
}

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
  const buffer = await fetch(url).then((r) => r.arrayBuffer());
  const executable = await extractFileFromTarGzip(new Uint8Array(buffer), subpath);
  await Deno.mkdir(finalDir, {
    recursive: true,
    mode: 448,
  });
  await Deno.writeFile(finalPath, executable, { mode: 493 });
  return finalPath;
}

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

export async function extractFileFromTarGzip(
  buffer: Uint8Array,
  file: string,
): Promise<Uint8Array> {
  try {
    const ds = new DecompressionStream("gzip");
    const writer = ds.writable.getWriter();
    await writer.write(new Uint8Array(buffer));
    await writer.close();
    const result = await new Response(ds.readable).arrayBuffer();
    buffer = new Uint8Array(result);
  } catch (err) {
    throw new Error(
      `Invalid gzip data in archive: ${(err as { message?: string })?.message || err}`,
    );
  }

  const str = (i: number, n: number): string =>
    String.fromCharCode(...buffer.subarray(i, i + n)).replace(/\0.*$/, "");
  let offset = 0;
  file = `package/${file}`;

  while (offset < buffer.length) {
    const name = str(offset, 100);
    const size = parseInt(str(offset + 124, 12), 8);
    offset += 512;

    if (!isNaN(size)) {
      if (name === file) return buffer.subarray(offset, offset + size);
      offset += (size + 511) & ~511;
    }
  }

  throw new Error(`Could not find ${JSON.stringify(file)} in archive`);
}

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
