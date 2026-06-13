import { parseArgs } from "@std/cli/parse-args";
import { resolve as resolvePath } from "@std/path";
import { DEFAULT_OUT_DIR } from "./constants.ts";
import { CliError } from "./errors.ts";
import type { Opt } from "./types.ts";

export function cli(args: readonly string[]): Opt {
  if (args.includes("--wasm") && args.includes("--no-wasm")) {
    throw new CliError("Cannot pass both --wasm and --no-wasm.");
  }

  const a = parseArgs(args, {
    alias: { h: "help", targets: "platforms" },
    boolean: ["clean", "help", "list", "wasm"],
    string: ["repo-dir", "out-dir", "version", "platforms"],
    negatable: ["wasm"],
    default: {
      "repo-dir": "./.build",
      "out-dir": DEFAULT_OUT_DIR,
      platforms: "all",
      wasm: true,
    },
    unknown: (arg) => {
      throw new CliError(`Unknown argument: ${arg}`);
    },
  });

  if (a.help) help();

  if (a._.length) {
    throw new CliError(`Unexpected positional argument: ${String(a._[0])}`);
  }

  return {
    repo: resolvePath(str(a["repo-dir"], "--repo-dir")),
    out: resolvePath(str(a["out-dir"], "--out-dir")),
    version: a.version === undefined ? null : str(a.version, "--version"),
    platforms: str(a.platforms, "--platforms"),
    wasm: bool(a.wasm, "--wasm"),
    list: bool(a.list, "--list"),
    clean: bool(a.clean, "--clean"),
  };
}

function help(): never {
  console.log(`Build esbuild binaries into one flat release asset directory.

Usage:
  deno task build:binaries -- --version 0.28.1 --clean

Options:
  --repo-dir <path>     Local esbuild checkout. Default: ./.build
  --out-dir <path>      Release asset output directory. Default: ./bin
  --version <version>   esbuild version, e.g. 0.28.1 or v0.28.1
  --platforms <list>    Comma-separated slugs, "wasm", or "all"
  --targets <list>      Alias for --platforms
  --wasm/--no-wasm      Include/skip main browser wasm
  --list                Print build plan
  --clean               Remove generated assets for selected targets first`);
  Deno.exit(0);
}

function str(v: unknown, flag: string): string {
  if (typeof v === "string" && v.length > 0) return v;
  throw new CliError(`Expected a value for ${flag}.`);
}

function bool(v: unknown, flag: string): boolean {
  if (typeof v === "boolean") return v;
  throw new CliError(`Expected a boolean value for ${flag}.`);
}
