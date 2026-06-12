import { join as joinPath } from "@std/path";
import { NAME, SKIP, WASM } from "./constants.ts";
import { CliError } from "./errors.ts";
import type { Def, Native, Parsed } from "./types.ts";

function parse(text: string): Parsed[] {
  const acc: { name: string; deps: string[]; body: string[] }[] = [];
  let cur: { name: string; deps: string[]; body: string[] } | null = null;
  let buf: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    if (raw.endsWith("\\")) {
      buf.push(raw.slice(0, -1));
      continue;
    }

    buf.push(raw);
    const line = buf.join(" ");
    buf = [];

    if (!line.trim()) {
      cur = null;
      continue;
    }

    if (line.startsWith("\t") || line.startsWith(" ")) {
      cur?.body.push(line);
      continue;
    }

    if (line.trimStart().startsWith("#")) {
      cur = null;
      continue;
    }

    const m = /^([A-Za-z0-9_.-]+):(.*)$/.exec(line);
    cur = m
      ? { name: m[1], deps: m[2].split(/\s+/).filter(Boolean), body: [] }
      : null;

    if (cur) acc.push(cur);
  }

  if (buf.length) {
    const line = buf.join(" ");
    const m = /^([A-Za-z0-9_.-]+):(.*)$/.exec(line);

    if (m) {
      acc.push({
        name: m[1],
        deps: m[2].split(/\s+/).filter(Boolean),
        body: [],
      });
    }
  }

  return acc.map((x) => ({
    name: x.name,
    deps: x.deps,
    body: x.body.join("\n"),
  }));
}

function env(body: string, name: string): string | null {
  return new RegExp(`\\b${name}=(\\S+)`).exec(body)?.[1] ?? null;
}

function kindOf(goos: string, goarch: string, bin: string): "native" | "wasi" {
  if (goos === "wasip1" && goarch === "wasm" && bin === WASM) return "wasi";

  if ((bin === "bin/esbuild" || bin === "esbuild.exe") && goos !== "wasip1") {
    return "native";
  }

  throw new CliError(
    `Unrecognized native target shape: GOOS=${goos}, GOARCH=${goarch}, BINPATH=${bin}.`,
  );
}

export function defs(makefile: string): Def[] {
  const out: Def[] = [];
  const seen = new Set<string>();

  for (const t of parse(Deno.readTextFileSync(makefile))) {
    if (
      !t.name.startsWith("platform-") || SKIP.has(t.name) ||
      t.name === "platform-wasm"
    ) {
      continue;
    }

    const slug = t.name.slice(9);

    if (seen.has(slug)) {
      throw new CliError(
        `Duplicate platform slug "${slug}" discovered in Makefile.`,
      );
    }

    seen.add(slug);

    const goos = env(t.body, "GOOS");
    const goarch = env(t.body, "GOARCH");
    const bin = env(t.body, "BINPATH");

    if (goos && goarch && bin) {
      const kind = kindOf(goos, goarch, bin);

      out.push({
        kind,
        slug,
        goos,
        goarch,
        exe: kind === "wasi" ? WASM : goos === "windows" ? "esbuild.exe" : NAME,
      });
    } else if (!goos && !goarch && !bin && t.deps.includes("platform-wasm")) {
      continue;
    } else {
      throw new CliError(
        `Unable to classify platform target "${t.name}". Got GOOS=${
          goos ?? "<unset>"
        }, GOARCH=${goarch ?? "<unset>"}, BINPATH=${bin ?? "<unset>"}.`,
      );
    }
  }

  out.push({ kind: "wasm" });
  return out;
}

export function assertDefs(d: readonly Def[]): void {
  if (!d.some((x) => x.kind !== "wasm")) {
    throw new CliError(
      `Parsed Makefile produced 0 native/wasi targets. Found ${d.length} total definitions.`,
    );
  }
}

export function pick(all: readonly Def[], raw: string, wasm: boolean): Def[] {
  const t = raw.trim();

  if (!t || t === "all") {
    return wasm ? [...all] : all.filter((d) => d.kind !== "wasm");
  }

  const want = new Set(t.split(",").map((x) => x.trim()).filter(Boolean));
  const known = new Set([
    "wasm",
    ...all.flatMap((d) => d.kind === "wasm" ? [] : [d.slug]),
  ]);

  for (const x of want) {
    if (!known.has(x)) {
      throw new CliError(
        `Unknown platform or slug "${x}". Valid values: ${
          [...known].join(", ")
        }.`,
      );
    }
  }

  return all.filter((d) =>
    d.kind === "wasm" ? wasm && want.has("wasm") : want.has(d.slug)
  );
}

export function order(d: readonly Def[]): Def[] {
  const groups: { native: Native[]; wasi: Native[]; wasm: Def[] } = {
    native: [],
    wasi: [],
    wasm: [],
  };

  for (const x of d) {
    if (x.kind === "wasm") groups.wasm.push(x);
    else groups[x.kind].push(x);
  }

  for (const k of ["native", "wasi"] as const) {
    groups[k].sort((a, b) => a.slug.localeCompare(b.slug));
  }

  return [...groups.wasm, ...groups.native, ...groups.wasi];
}

export function plan(d: readonly Def[], out: string): void {
  console.log(`Build plan: ${d.length} artifact${d.length === 1 ? "" : "s"}`);

  for (const x of d) {
    if (x.kind === "wasm") {
      console.log(
        `- kind=wasm, slug=browser-wasm, goos=js, goarch=wasm, executable=${WASM}, output=${
          joinPath(out, assetName(x))
        }`,
      );
    } else {
      console.log(
        `- kind=${x.kind}, slug=${x.slug}, goos=${x.goos}, goarch=${x.goarch}, executable=${x.exe}, output=${
          joinPath(out, assetName(x))
        }`,
      );
    }
  }
}

export function assetName(d: Def): string {
  if (d.kind === "wasm") return "esbuild-browser.wasm";
  if (d.kind === "wasi") return `esbuild-${d.slug}.wasm`;

  const ext = d.goos === "windows" ? ".exe" : "";
  return `esbuild-${d.slug}${ext}`;
}
