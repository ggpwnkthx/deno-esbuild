import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1.0.19";
import {
  extractFileFromTarGzip,
  getCachePath,
  getModVersion,
  getVersion,
  install,
  installFromNPM,
} from "@ggpwnkthx/esbuild/install";
import { stop } from "@ggpwnkthx/esbuild";

const testBinPath = Deno.env.get("ESBUILD_BINARY_PATH");

async function resetState(): Promise<void> {
  await stop();
}

function createTarGzip(files: Record<string, string>): Uint8Array {
  const chunks: Uint8Array[] = [];

  for (const [path, content] of Object.entries(files)) {
    const contentBytes = new TextEncoder().encode(content);
    const paddedSize = Math.ceil(contentBytes.length / 512) * 512;

    const header = new Uint8Array(512);
    const nameBytes = new TextEncoder().encode(path);
    header.set(nameBytes.slice(0, 100), 0);
    header.set(new TextEncoder().encode("0000644"), 100);
    const sizeOctal = contentBytes.length.toString(8).padStart(11, "0");
    header.set(new TextEncoder().encode(sizeOctal + " \0"), 124);
    header.set(new TextEncoder().encode("0000000"), 136);
    header.set(new TextEncoder().encode("0"), 156);
    header.set(new TextEncoder().encode("ustar\0"), 257);
    header.set(new TextEncoder().encode("root"), 265);
    header.set(new TextEncoder().encode("root"), 297);

    let checksum = 0;
    for (let i = 0; i < 512; i++) {
      if (i >= 148 && i < 156) {
        checksum += 32;
      } else {
        checksum += header[i];
      }
    }
    const checksumOctal = checksum.toString(8).padStart(6, "0");
    header.set(new TextEncoder().encode(checksumOctal + "\0 "), 148);

    chunks.push(header);
    const padded = new Uint8Array(paddedSize);
    padded.set(contentBytes);
    chunks.push(padded);
  }

  chunks.push(new Uint8Array(1024));

  const tarData = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    tarData.set(chunk, offset);
    offset += chunk.length;
  }

  return tarData;
}

async function gzipAsync(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  const compressedPromise = new Response(cs.readable).arrayBuffer();
  await writer.write(data.buffer as ArrayBuffer);
  await writer.close();
  const buffer = await compressedPromise;
  return new Uint8Array(buffer);
}

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    Deno.env.delete(key);
  } else {
    Deno.env.set(key, value);
  }
}

function getEnv(key: string): string | undefined {
  return Deno.env.get(key);
}

Deno.test("getCachePath uses macOS cache location when on darwin", () => {
  if (Deno.build.os !== "darwin") return;

  const originalHome = getEnv("HOME");
  const originalXdg = getEnv("XDG_CACHE_HOME");

  try {
    setEnv("HOME", "/Users/testuser");
    setEnv("XDG_CACHE_HOME", undefined);

    const { finalPath, finalDir } = getCachePath("@esbuild/test");
    assertEquals(finalDir, "/Users/testuser/Library/Caches/esbuild/bin");
    assertEquals(
      finalPath,
      "/Users/testuser/Library/Caches/esbuild/bin/@esbuild-test@" + getVersion(),
    );
  } finally {
    setEnv("HOME", originalHome);
    setEnv("XDG_CACHE_HOME", originalXdg);
  }
});

Deno.test("getCachePath uses Windows cache location when on windows", () => {
  if (Deno.build.os !== "windows") return;

  const originalLocalAppData = getEnv("LOCALAPPDATA");
  const originalUserProfile = getEnv("USERPROFILE");
  const originalHome = getEnv("HOME");

  try {
    setEnv("LOCALAPPDATA", "C:\\Users\\test\\AppData\\Local");
    setEnv("USERPROFILE", undefined);
    setEnv("HOME", undefined);

    const { finalPath, finalDir } = getCachePath("@esbuild/test");
    assertEquals(finalDir, "C:\\Users\\test\\AppData\\Local\\Cache\\esbuild\\bin");
    assertEquals(
      finalPath,
      "C:\\Users\\test\\AppData\\Local\\Cache\\esbuild\\bin\\@esbuild-test@"
        + getVersion(),
    );
  } finally {
    setEnv("LOCALAPPDATA", originalLocalAppData);
    setEnv("USERPROFILE", originalUserProfile);
    setEnv("HOME", originalHome);
  }
});

Deno.test("getCachePath uses XDG_CACHE_HOME when set on Linux", async () => {
  if (Deno.build.os !== "linux") return;
  await getModVersion();

  const originalXdg = getEnv("XDG_CACHE_HOME");
  const originalHome = getEnv("HOME");

  try {
    setEnv("XDG_CACHE_HOME", "/custom/cache");
    setEnv("HOME", "/home/testuser");

    const { finalPath, finalDir } = getCachePath("@esbuild/test");
    assertEquals(finalDir, "/custom/cache/esbuild/bin");
    assertEquals(finalPath, "/custom/cache/esbuild/bin/@esbuild-test@" + getVersion());
  } finally {
    setEnv("XDG_CACHE_HOME", originalXdg);
    setEnv("HOME", originalHome);
  }
});

Deno.test("getCachePath falls back to HOME/.cache when XDG_CACHE_HOME not set on Linux", async () => {
  if (Deno.build.os !== "linux") return;
  await getModVersion();

  const originalXdg = getEnv("XDG_CACHE_HOME");
  const originalHome = getEnv("HOME");

  try {
    setEnv("XDG_CACHE_HOME", undefined);
    setEnv("HOME", "/home/testuser");

    const { finalPath, finalDir } = getCachePath("@esbuild/test");
    assertEquals(finalDir, "/home/testuser/.cache/esbuild/bin");
    assertEquals(
      finalPath,
      "/home/testuser/.cache/esbuild/bin/@esbuild-test@" + getVersion(),
    );
  } finally {
    setEnv("XDG_CACHE_HOME", originalXdg);
    setEnv("HOME", originalHome);
  }
});

Deno.test("getCachePath throws when no cache directory can be determined", () => {
  if (
    Deno.build.os === "windows" || Deno.build.os === "darwin"
    || Deno.build.os === "linux"
  ) {
    return;
  }

  const originalXdg = getEnv("XDG_CACHE_HOME");
  const originalHome = getEnv("HOME");
  const originalLocalAppData = getEnv("LOCALAPPDATA");
  const originalUserProfile = getEnv("USERPROFILE");

  try {
    setEnv("XDG_CACHE_HOME", undefined);
    setEnv("HOME", undefined);
    setEnv("LOCALAPPDATA", undefined);
    setEnv("USERPROFILE", undefined);

    assertThrows(
      () => getCachePath("@esbuild/test"),
      Error,
      "Failed to find cache directory",
    );
  } finally {
    setEnv("XDG_CACHE_HOME", originalXdg);
    setEnv("HOME", originalHome);
    setEnv("LOCALAPPDATA", originalLocalAppData);
    setEnv("USERPROFILE", originalUserProfile);
  }
});

Deno.test("getCachePath constructs correct path format on current platform", async () => {
  await getModVersion();
  const { finalPath, finalDir } = getCachePath("@esbuild/test");
  const expectedSuffix = Deno.build.os === "windows"
    ? "\\esbuild\\bin"
    : "/esbuild/bin";
  assertEquals(finalDir.endsWith(expectedSuffix), true);
  assertEquals(finalPath.includes("@esbuild-test@"), true);
});

Deno.test("extractFileFromTarGzip returns the requested package/... file", async () => {
  const tarData = createTarGzip({
    "package/bin/esbuild": "console.log('hello')",
    "package/README.md": "# esbuild",
  });

  const compressed = await gzipAsync(tarData);
  const extracted = await extractFileFromTarGzip(compressed, "bin/esbuild");
  assertEquals(new TextDecoder().decode(extracted), "console.log('hello')");
});

Deno.test("extractFileFromTarGzip throws for invalid gzip data", async () => {
  const invalidGzip = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

  await assertRejects(
    () => extractFileFromTarGzip(invalidGzip, "bin/esbuild"),
    Error,
    "Invalid gzip data in archive",
  );
});

Deno.test("extractFileFromTarGzip throws when file is missing", async () => {
  const tarData = createTarGzip({
    "package/README.md": "# esbuild",
  });

  const compressed = await gzipAsync(tarData);

  await assertRejects(
    () => extractFileFromTarGzip(compressed, "bin/esbuild"),
    Error,
    'Could not find "package/bin/esbuild" in archive',
  );
});

Deno.test("extractFileFromTarGzip correctly skips tar padding", async () => {
  const content = "x".repeat(700);
  const tarData = createTarGzip({
    "package/bin/test": content,
  });

  const compressed = await gzipAsync(tarData);
  const extracted = await extractFileFromTarGzip(compressed, "bin/test");
  assertEquals(new TextDecoder().decode(extracted), content);
});

Deno.test("installFromNPM returns cached binary path when file exists", async () => {
  await resetState();
  if (!testBinPath) {
    await resetState();
    return;
  }

  const { finalPath, finalDir } = getCachePath("@esbuild/test");
  await Deno.mkdir(finalDir, { recursive: true });
  await Deno.writeFile(finalPath, new Uint8Array([0x00]));

  const result = await installFromNPM("@esbuild/test", "bin/test");
  assertEquals(typeof result, "string");
  assertEquals(result.includes("@esbuild-test@"), true);
  await resetState();
});

Deno.test("install returns ESBUILD_BINARY_PATH when set", async () => {
  await resetState();
  setEnv("ESBUILD_BINARY_PATH", "/custom/path/esbuild");
  try {
    const result = await install();
    assertEquals(result, "/custom/path/esbuild");
  } finally {
    setEnv("ESBUILD_BINARY_PATH", undefined);
    await resetState();
  }
});

Deno.test("install uses correct package for current platform", async () => {
  await resetState();
  if (testBinPath) {
    await resetState();
    return;
  }

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

  const isKnownPlatform = platformKey in knownWindowsPackages
    || platformKey in knownUnixlikePackages;
  if (!isKnownPlatform) {
    await resetState();
    return;
  }

  try {
    const result = await install();
    assertEquals(typeof result, "string");
    assertEquals(result.length > 0, true);
  } finally {
    await resetState();
  }
});
