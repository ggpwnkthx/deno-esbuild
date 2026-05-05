export interface PermissionAnalysis {
  readonly read: readonly string[];
  readonly write: readonly string[];
  readonly net: readonly string[];
  readonly env: readonly string[];
  readonly sys: boolean;
  readonly ffi: boolean;
  readonly run: boolean;
  readonly hrtime: boolean;
}

export function analyzeDenoPermissionNeeds(
  command: string,
): PermissionAnalysis {
  const read = new Set<string>();
  const write = new Set<string>();
  const net = new Set<string>();
  const env = new Set<string>();
  let sys = false;
  let ffi = false;
  let run = false;
  let hrtime = false;

  const lower = command.toLowerCase();

  if (
    /\b(fetch|websocket|serve|listen|connect|postgres|mysql|redis|s3|mqtt|amqp)\b/
      .test(lower)
  ) {
    net.add("<host>");
  }

  if (/\b(process\.env|deno\.env|getenv|--env|-e )\b/.test(lower)) {
    env.add("<name>");
  }

  if (
    /\b(subprocess|spawn|exec|command\(|deno\.command|bun\.spawn|bun\.\$)\b/
      .test(lower)
  ) {
    run = true;
  }

  if (/\bffi|dlopen|dynamic library|\.so|\.dylib|\.dll\b/.test(lower)) {
    ffi = true;
  }

  if (
    /\b(os\.|hostname|loadavg|networkinterfaces|uid|gid|memoryusage|systemmemoryinfo)\b/
      .test(lower)
  ) {
    sys = true;
  }

  if (/\bperformance\.now|hrtime\b/.test(lower)) {
    hrtime = true;
  }

  if (
    /\b(readfile|readtextfile|readfileSync|open\(|watchfs|watch|glob|walk)\b/
      .test(lower)
  ) {
    read.add("<path>");
  }

  if (
    /\b(writefile|writetextfile|mkdir|copy|rename|remove|truncate|create|append)\b/
      .test(lower)
  ) {
    write.add("<path>");
  }

  return {
    read: [...read],
    write: [...write],
    net: [...net],
    env: [...env],
    sys,
    ffi,
    run,
    hrtime,
  };
}

export function formatPermissionFlags(analysis: PermissionAnalysis): string[] {
  const flags: string[] = [];

  if (analysis.read.length > 0) {
    flags.push(`--allow-read=${analysis.read.join(",")}`);
  }
  if (analysis.write.length > 0) {
    flags.push(`--allow-write=${analysis.write.join(",")}`);
  }
  if (analysis.net.length > 0) {
    flags.push(`--allow-net=${analysis.net.join(",")}`);
  }
  if (analysis.env.length > 0) {
    flags.push(`--allow-env=${analysis.env.join(",")}`);
  }
  if (analysis.sys) flags.push("--allow-sys");
  if (analysis.ffi) flags.push("--allow-ffi");
  if (analysis.run) flags.push("--allow-run");
  if (analysis.hrtime) flags.push("--allow-hrtime");

  return flags;
}
