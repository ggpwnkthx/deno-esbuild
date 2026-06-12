import { encodeHex } from "@std/encoding/hex";
import { CommandError } from "./errors.ts";
import type { CommandOpts } from "./types.ts";

const dec = new TextDecoder();

export async function sha256(path: string): Promise<string> {
  return encodeHex(
    await crypto.subtle.digest("SHA-256", await Deno.readFile(path)),
  );
}

export async function text(
  cmd: string,
  args: readonly string[],
  opts: CommandOpts,
): Promise<string> {
  return dec.decode((await run(cmd, args, opts)).stdout);
}

export async function run(
  cmd: string,
  args: readonly string[],
  opts: CommandOpts,
): Promise<Deno.CommandOutput> {
  const commandOpts: Deno.CommandOptions = {
    args: [...args],
    stdout: "piped",
    stderr: "piped",
  };

  if (opts.cwd) commandOpts.cwd = opts.cwd;
  if (opts.env) commandOpts.env = opts.env;

  const r = await new Deno.Command(cmd, commandOpts).output();

  if (!r.success) {
    throw new CommandError(
      cmd,
      args,
      opts.cwd,
      r.code,
      dec.decode(r.stdout),
      dec.decode(r.stderr),
    );
  }

  return r;
}

export async function isFile(path: string): Promise<boolean> {
  try {
    return (await Deno.stat(path)).isFile;
  } catch (e: unknown) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await Deno.stat(path)).isDirectory;
  } catch (e: unknown) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
  }
}

export async function removeIfExists(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch (e: unknown) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
}
