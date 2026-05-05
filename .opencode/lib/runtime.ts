export interface RuntimeContext {
  readonly directory?: string;
  readonly worktree: string;
}

export interface CommandOptions {
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
  readonly timeoutMs?: number;
}

export interface CommandResult {
  readonly cmd: readonly string[];
  readonly cwd: string | undefined;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export async function runCommand(
  context: RuntimeContext,
  cmd: readonly string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  validateCommand(cmd);

  const cwd = options.cwd ?? context.directory ?? context.worktree;
  const env = {
    ...process.env,
    ...options.env,
  };

  const proc = Bun.spawn([...cmd], {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: options.timeoutMs,
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    readStream(proc.stdout),
    readStream(proc.stderr),
    proc.exited,
  ]);

  return {
    cmd,
    cwd,
    exitCode,
    stdout,
    stderr,
  };
}

function validateCommand(cmd: readonly string[]): void {
  if (cmd.length === 0) {
    throw new Error("Command must contain at least one token.");
  }

  for (const token of cmd) {
    if (token.length === 0) {
      throw new Error("Command tokens may not be empty.");
    }
    if (/[\r\n\0]/.test(token)) {
      throw new Error("Command tokens may not contain control characters.");
    }
  }
}

async function readStream(
  stream: ReadableStream<Uint8Array> | null | undefined,
): Promise<string> {
  if (!stream) return "";
  return await new Response(stream).text();
}

export function formatCommand(cmd: readonly string[]): string {
  return cmd.map(quoteShellToken).join(" ");
}

export function quoteShellToken(token: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(token)) {
    return token;
  }

  return `'${token.replaceAll("'", `'\\''`)}'`;
}

export function clipText(text: string, maxChars = 8_000): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated ${
    text.length - maxChars
  } chars]`;
}

export function commandReport(
  result: CommandResult,
  maxChars = 12_000,
): string {
  return [
    `Exit code: ${result.exitCode}`,
    "",
    "### Command",
    formatCommand(result.cmd),
    "",
    "### Working directory",
    result.cwd ?? "(default)",
    "",
    "### Stdout",
    clipText(result.stdout, maxChars) || "(empty)",
    "",
    "### Stderr",
    clipText(result.stderr, maxChars) || "(empty)",
  ].join("\n");
}
