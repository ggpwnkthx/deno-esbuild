import { version } from "../mod.ts";

const textDecoder = new TextDecoder();
const moduleUnderTest = new URL("../mod.ts", import.meta.url).href;
const wasmModuleUnderTest = new URL("../wasm.ts", import.meta.url).href;

interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface IsolatedRuntime {
  readonly rootDir: string;
  readonly env: Record<string, string>;
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

function assertIncludes(
  actual: string,
  expectedSubstring: string,
  message: string,
): void {
  if (!actual.includes(expectedSubstring)) {
    throw new Error(
      `${message}\nExpected substring: ${expectedSubstring}\nActual: ${actual}`,
    );
  }
}

async function withIsolatedRuntime<T>(
  fn: (runtime: IsolatedRuntime) => Promise<T>,
): Promise<T> {
  const rootDir = await Deno.makeTempDir({
    prefix: "deno-esbuild-binary-test-",
  });

  const env: Record<string, string> = {
    HOME: `${rootDir}/home`,
    XDG_CACHE_HOME: `${rootDir}/xdg-cache`,
    LOCALAPPDATA: `${rootDir}/local-app-data`,
    USERPROFILE: `${rootDir}/user-profile`,
    DENO_DIR: `${rootDir}/deno-dir`,
    NO_COLOR: "1",
  };

  try {
    return await fn({ rootDir, env });
  } finally {
    await Deno.remove(rootDir, { recursive: true });
  }
}

async function runDeno(
  args: string[],
  env: Record<string, string>,
): Promise<CommandResult> {
  const output = await new Deno.Command(Deno.execPath(), {
    args,
    env,
    stdout: "piped",
    stderr: "piped",
  }).output();

  return {
    code: output.code,
    stdout: textDecoder.decode(output.stdout),
    stderr: textDecoder.decode(output.stderr),
  };
}

async function runExecutable(
  command: string,
  args: string[],
): Promise<CommandResult> {
  const output = await new Deno.Command(command, {
    args,
    stdout: "piped",
    stderr: "piped",
  }).output();

  return {
    code: output.code,
    stdout: textDecoder.decode(output.stdout),
    stderr: textDecoder.decode(output.stderr),
  };
}

function assertSuccessfulCommand(
  result: CommandResult,
  label: string,
): void {
  assertEquals(
    result.code,
    0,
    `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
}

async function writeProbeScript(rootDir: string): Promise<string> {
  const path = `${rootDir}/probe.ts`;

  await Deno.writeTextFile(
    path,
    `
import * as esbuild from ${JSON.stringify(moduleUnderTest)};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const transformed = await esbuild.transform(
    "export const answer: number = 42;",
    {
      loader: "ts",
      format: "esm",
    },
  );

  assert(
    transformed.code.includes("answer"),
    "transform output should contain the exported symbol",
  );

  assert(
    !transformed.code.includes(": number"),
    "transform output should not contain TypeScript annotations",
  );

  const buildResult = await esbuild.build({
    stdin: {
      contents: "export const answer: number = 42;",
      loader: "ts",
      sourcefile: "entry.ts",
    },
    bundle: true,
    format: "esm",
    platform: "neutral",
    write: false,
  });

  const output = buildResult.outputFiles?.[0]?.text ?? "";

  assert(
    output.includes("answer"),
    "build output should contain the exported symbol",
  );

  assert(
    !output.includes(": number"),
    "build output should not contain TypeScript annotations",
  );
} finally {
  await esbuild.stop();
}
`,
  );

  return path;
}

async function writeWasmProbeScript(rootDir: string): Promise<string> {
  const path = `${rootDir}/wasm_probe.ts`;
  const wasmURL = `https://unpkg.com/esbuild-wasm@${version}/esbuild.wasm`;

  await Deno.writeTextFile(
    path,
    `
import * as esbuild from ${JSON.stringify(wasmModuleUnderTest)};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const response = await fetch(${JSON.stringify(wasmURL)});
if (!response.ok) {
  throw new Error(
    \`Failed to download esbuild.wasm: \${response.status} \${response.statusText}\`,
  );
}

const wasmModule = await WebAssembly.compile(
  await response.arrayBuffer(),
);

try {
  await esbuild.initialize({
    wasmModule,
    worker: true,
  });

  const transformed = await esbuild.transform(
    "export const answer: number = 42;",
    {
      loader: "ts",
      format: "esm",
    },
  );

  assert(
    transformed.code.includes("answer"),
    "WASM transform output should contain the exported symbol",
  );

  assert(
    !transformed.code.includes(": number"),
    "WASM transform output should not contain TypeScript annotations",
  );

  const buildResult = await esbuild.build({
    stdin: {
      contents: "export const answer: number = 42;",
      loader: "ts",
      sourcefile: "entry.ts",
    },
    bundle: true,
    format: "esm",
    platform: "neutral",
    write: false,
  });

  const output = buildResult.outputFiles?.[0]?.text ?? "";

  assert(
    output.includes("answer"),
    "WASM build output should contain the exported symbol",
  );

  assert(
    !output.includes(": number"),
    "WASM build output should not contain TypeScript annotations",
  );
} finally {
  await esbuild.stop();
}
`,
  );

  return path;
}

async function* walkFiles(rootDir: string): AsyncIterable<string> {
  for await (const entry of Deno.readDir(rootDir)) {
    const path = `${rootDir}/${entry.name}`;

    if (entry.isDirectory) {
      yield* walkFiles(path);
      continue;
    }

    if (entry.isFile) yield path;
  }
}

async function findDownloadedBinary(rootDir: string): Promise<string> {
  for await (const path of walkFiles(rootDir)) {
    const filename = path.split(/[\\/]/).at(-1) ?? path;

    if (filename.startsWith("esbuild-") && filename.includes(`@${version}`)) {
      return path;
    }
  }

  throw new Error(
    `Could not find cached esbuild binary for version ${version} under ${rootDir}`,
  );
}

function denoRunPermissions(options: { allowNet: boolean }): string[] {
  const permissions = [
    "--no-prompt",
    "--allow-env=HOME,XDG_CACHE_HOME,LOCALAPPDATA,USERPROFILE,ESBUILD_BINARY_PATH",
    "--allow-read",
    "--allow-write",
    "--allow-run",
  ];

  if (options.allowNet) permissions.push("--allow-net");

  return permissions;
}

Deno.test("downloads the esbuild binary, starts the service, and runs the executable", async () => {
  await withIsolatedRuntime(async ({ rootDir, env }) => {
    const probePath = await writeProbeScript(rootDir);

    const firstRun = await runDeno([
      "run",
      ...denoRunPermissions({ allowNet: true }),
      probePath,
    ], env);

    assertSuccessfulCommand(firstRun, "fresh-cache esbuild API probe");

    const binaryPath = await findDownloadedBinary(rootDir);

    const versionRun = await runExecutable(binaryPath, ["--version"]);
    assertSuccessfulCommand(versionRun, "direct esbuild binary --version");

    assertEquals(
      versionRun.stdout.trim(),
      version,
      "downloaded esbuild binary version should match the wrapper version",
    );
  });
});

Deno.test("reuses the cached esbuild binary without network access", async () => {
  await withIsolatedRuntime(async ({ rootDir, env }) => {
    const probePath = await writeProbeScript(rootDir);

    const warmCacheRun = await runDeno([
      "run",
      ...denoRunPermissions({ allowNet: true }),
      probePath,
    ], env);

    assertSuccessfulCommand(warmCacheRun, "cache-warming esbuild API probe");

    const cachedRun = await runDeno([
      "run",
      ...denoRunPermissions({ allowNet: false }),
      probePath,
    ], env);

    assertSuccessfulCommand(cachedRun, "cached esbuild API probe");

    await findDownloadedBinary(rootDir);
  });
});

Deno.test("module CLI forwards to the downloaded esbuild binary", async () => {
  await withIsolatedRuntime(async ({ rootDir, env }) => {
    const cliRun = await runDeno([
      "run",
      ...denoRunPermissions({ allowNet: true }),
      moduleUnderTest,
      "--version",
    ], env);

    assertSuccessfulCommand(cliRun, "module CLI --version");

    assertEquals(
      cliRun.stdout.trim(),
      version,
      "module CLI should print the esbuild binary version",
    );

    const binaryPath = await findDownloadedBinary(rootDir);
    assertIncludes(
      binaryPath,
      `@${version}`,
      "CLI run should cache a version-suffixed esbuild binary",
    );
  });
});

Deno.test("WASM API initializes and runs transform and build", async () => {
  await withIsolatedRuntime(async ({ rootDir, env }) => {
    const probePath = await writeWasmProbeScript(rootDir);

    const wasmRun = await runDeno([
      "run",
      ...denoRunPermissions({ allowNet: true }),
      probePath,
    ], env);

    assertSuccessfulCommand(wasmRun, "WASM esbuild API probe");
  });
});
