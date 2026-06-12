import { parseArgs } from "@std/cli/parse-args";
import { resolve as resolvePath } from "@std/path";
import { CliError } from "./errors.ts";
import { type Opt } from "./types.ts";

export function cli(args: readonly string[]): Opt {
  if (args.includes("--wasm") && args.includes("--no-wasm")) {
    throw new CliError("Cannot pass both --wasm and --no-wasm.");
  }

  const a = parseArgs(args, {
    alias: { h: "help", targets: "platforms" },
    boolean: ["clean", "help", "list", "wasm"],
    string: ["repo-dir", "out-dir", "scope", "version", "platforms"],
    negatable: ["wasm"],
    default: {
      "repo-dir": "./.build",
      "out-dir": "./",
      scope: "@ggpwnkthx",
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
    scope: scopeName(str(a.scope, "--scope")),
    version: a.version === undefined ? null : str(a.version, "--version"),
    platforms: str(a.platforms, "--platforms"),
    wasm: bool(a.wasm, "--wasm"),
    list: bool(a.list, "--list"),
    clean: bool(a.clean, "--clean"),
  };
}

function help(): never {
  console.log(`Build esbuild binaries and generate one unified JSR package.

Usage: deno run -A build.ts --scope @your-scope --clean

Options:
  --scope <scope>       JSR scope. Default: @ggpwnkthx
  --repo-dir <path>     Local esbuild checkout. Default: ./.build
  --out-dir <path>      Parent output directory. Default: ./
  --version <version>   esbuild version, e.g. 0.28.0 or v0.28.0
  --platforms <list>    Comma-separated slugs, "wasm", or "all"
  --targets <list>      Alias for --platforms
  --wasm/--no-wasm      Include/skip main browser wasm
  --list                Print build plan
  --clean               Remove generated artifacts first`);
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

function scopeName(s: string): string {
  const t = s.trim();
  if (!/^@[a-z0-9][a-z0-9_-]*$/i.test(t)) {
    throw new CliError(
      `Invalid JSR scope "${s}". Expected a value like "@your-scope".`,
    );
  }
  return t.toLowerCase();
}
