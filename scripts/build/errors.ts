export class CliError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "CliError";
  }
}

export class CommandError extends Error {
  constructor(
    cmd: string,
    args: readonly string[],
    cwd: string | undefined,
    code: number,
    out: string,
    err: string,
  ) {
    super(
      [
        `Command failed with exit code ${code}: ${cmd} ${args.join(" ")}`,
        cwd && `cwd: ${cwd}`,
        out.trim() && `stdout:\n${out.trimEnd()}`,
        err.trim() && `stderr:\n${err.trimEnd()}`,
      ].filter((x): x is string => typeof x === "string").join("\n\n"),
    );
    this.name = "CommandError";
  }
}
