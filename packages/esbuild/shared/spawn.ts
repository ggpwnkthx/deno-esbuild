/**
 * @module
 * Spawns the native esbuild binary for the transport in `mod.ts`.
 *
 * {@link spawnWithDenoCommand} wraps `Deno.Command` in a narrow
 * {@link SpawnHandle} exposing only what the esbuild service needs
 * (write/read/close/status).
 */

/**
 * Minimal subprocess handle used by the native-binary transport. The shape is
 * deliberately narrow (only what the esbuild service needs).
 */
interface SpawnHandle {
  write(bytes: Uint8Array): void
  read(): Promise<Uint8Array | null>
  close(): Promise<void> | void
  status(): Promise<{ code: number }>
}

/** Options for {@link spawnWithDenoCommand}. */
interface SpawnOptions {
  args: string[]
  stdin: 'piped' | 'inherit'
  stdout: 'piped' | 'inherit'
  stderr: 'inherit'
}

function validateSpawnOptions(options: SpawnOptions): void {
  const validStdio = (v: string, field: string): void => {
    if (v !== 'piped' && v !== 'inherit') {
      throw new Error(
        `Invalid ${field}: expected 'piped' or 'inherit', got ${JSON.stringify(v)}`,
      )
    }
  }
  validStdio(options.stdin, 'stdin')
  validStdio(options.stdout, 'stdout')
  validStdio(options.stderr, 'stderr')
}

/**
 * Spawns a process using `Deno.Command` (Deno ≥ 1.40) and returns a
 * {@link SpawnHandle} for it.
 */
export function spawnWithDenoCommand(
  cmd: string,
  options: SpawnOptions,
): SpawnHandle {
  validateSpawnOptions(options)
  const child = new Deno.Command(cmd, {
    args: options.args,
    cwd: Deno.cwd(),
    stdin: options.stdin,
    stdout: options.stdout,
    stderr: options.stderr,
  }).spawn()
  // Note: Need to check for "piped" in Deno ≥1.31.0 to avoid a crash
  const writer = options.stdin === 'piped' ? child.stdin.getWriter() : null
  const reader = options.stdout === 'piped' ? child.stdout.getReader() : null
  return {
    write: writer ? (bytes) => writer.write(bytes) : () => Promise.resolve(),
    read: reader ? () => reader.read().then((x) => x.value || null) : () => Promise.resolve(null),
    close: async () => {
      // We can't call "kill()" because it doesn't seem to work. Tests will
      // still fail with "A child process was opened during the test, but not
      // closed during the test" even though we kill the child process.
      //
      // And we can't call both "writer.close()" and "kill()" because then
      // there's a race as the child process exits when stdin is closed, and
      // "kill()" fails when the child process has already been killed.
      //
      // So instead we just call "writer.close()" and then hope that this
      // causes the child process to exit. It won't work if the stdin consumer
      // thread in the child process is hung or busy, but that may be the best
      // we can do.
      //
      // See this for more info: https://github.com/evanw/esbuild/pull/3611
      if (writer) await writer.close()
      if (reader) await reader.cancel()

      // Wait for the process to exit. The new "kill()" API doesn't flag the
      // process as having exited because processes can technically ignore the
      // kill signal. Without this, Deno will fail tests that use esbuild with
      // an error because the test spawned a process but didn't wait for it.
      await child.status
    },
    status: () => child.status,
  }
}
