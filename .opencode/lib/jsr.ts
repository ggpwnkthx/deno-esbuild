import { readdir, readFile, stat } from "node:fs/promises";
import { join as joinFsPath } from "node:path";

import type { RuntimeContext } from "./runtime.ts";
import { dirname, normalizePath, resolveInside } from "./path.ts";

export type JsrIssueSeverity = "blocker" | "major" | "minor" | "note";

export interface JsrAuditIssue {
  readonly severity: JsrIssueSeverity;
  readonly check: string;
  readonly file?: string;
  readonly line?: number;
  readonly symbol?: string;
  readonly message: string;
  readonly fix: string;
}

export interface JsrExportEntry {
  readonly specifier: string;
  readonly path: string;
}

export interface ExportedSymbol {
  readonly name: string;
  readonly kind: string;
  readonly line: number;
  readonly documented: boolean;
  readonly explicitPublicType: boolean;
}

export interface ModuleDocStatus {
  readonly entrypoint: JsrExportEntry;
  readonly exists: boolean;
  readonly hasModuleDoc: boolean;
  readonly exportedSymbols: readonly ExportedSymbol[];
}

export interface JsrProvenanceStatus {
  readonly workflowFiles: readonly string[];
  readonly hasPublishWorkflow: boolean;
  readonly hasOidcPermission: boolean;
}

export interface JsrAuditReport {
  readonly root: string;
  readonly configFile: string | null;
  readonly packageName: string | null;
  readonly version: string | null;
  readonly license: string | null;
  readonly exports: readonly JsrExportEntry[];
  readonly readmeFile: string | null;
  readonly readmeHasUsageExample: boolean;
  readonly modules: readonly ModuleDocStatus[];
  readonly provenance: JsrProvenanceStatus;
  readonly issues: readonly JsrAuditIssue[];
}

interface PackageConfig {
  readonly name?: string;
  readonly version?: string;
  readonly license?: string;
  readonly exports?: unknown;
  readonly publish?: unknown;
}

interface AuditOptions {
  readonly cwd?: string;
}

const CONFIG_FILES = [
  "deno.json",
  "deno.jsonc",
  "jsr.json",
  "jsr.jsonc",
] as const;

const README_FILES = [
  "README.md",
  "readme.md",
] as const;

const JS_TS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"]);

export async function runJsrPackageAudit(
  context: RuntimeContext,
  options: AuditOptions = {},
): Promise<string> {
  const root = options.cwd ? resolveInside(context.worktree, options.cwd) : context.worktree;
  const report = await auditJsrPackage(root);
  return formatJsrAuditReport(report);
}

export async function auditJsrPackage(root: string): Promise<JsrAuditReport> {
  const issues: JsrAuditIssue[] = [];

  const configResult = await readPackageConfig(root);
  if (!configResult) {
    issues.push({
      severity: "blocker",
      check: "package-config",
      message:
        "No deno.json, deno.jsonc, jsr.json, or jsr.jsonc package config was found at the audit root.",
      fix:
        "Add a package config with name, version, exports, and publish metadata before attempting a JSR release.",
    });
  }

  const config = configResult?.config ?? {};
  const configFile = configResult?.file ?? null;
  const packageName = typeof config.name === "string" ? config.name : null;
  const version = typeof config.version === "string" ? config.version : null;
  const license = typeof config.license === "string" ? config.license : null;

  if (configResult) {
    if (!packageName) {
      issues.push({
        severity: "blocker",
        check: "package-config",
        file: configResult.file,
        message: "Package config is missing a string `name` field.",
        fix: 'Add a scoped JSR package name such as `"name": "@scope/package"`.',
      });
    }

    if (!version) {
      issues.push({
        severity: "blocker",
        check: "package-config",
        file: configResult.file,
        message: "Package config is missing a string `version` field.",
        fix: "Add a semver `version` field before publishing.",
      });
    }

    if (!license) {
      issues.push({
        severity: "minor",
        check: "package-metadata",
        file: configResult.file,
        message: "Package config does not declare a `license` field.",
        fix: "Add the package license when the repository owns the published code.",
      });
    }
  }

  const exports = configResult ? extractExports(config.exports) : [];
  if (configResult && exports.length === 0) {
    issues.push({
      severity: "blocker",
      check: "package-exports",
      file: configResult.file,
      message: "Package config does not expose any `exports` entrypoints.",
      fix: 'Declare `"exports": "./mod.ts"` or an explicit exports map.',
    });
  }

  const readme = await readFirstExisting(root, README_FILES);
  if (!readme) {
    issues.push({
      severity: "major",
      check: "readme",
      message: "No root README.md was found.",
      fix: "Add a README with a short package overview, import/install snippet, and usage example.",
    });
  }

  const readmeHasUsageExample = readme ? hasUsefulReadmeExample(readme.text) : false;
  if (readme && !readmeHasUsageExample) {
    issues.push({
      severity: "major",
      check: "readme-example",
      file: readme.file,
      message: "README exists but does not appear to contain a useful code usage example.",
      fix:
        "Add a fenced TypeScript/JavaScript or shell example showing how to import and call the package.",
    });
  }

  const modules: ModuleDocStatus[] = [];
  for (const entrypoint of exports) {
    const moduleStatus = await inspectModule(root, entrypoint);
    modules.push(moduleStatus);

    if (!moduleStatus.exists) {
      issues.push({
        severity: "blocker",
        check: "entrypoint",
        file: entrypoint.path,
        message:
          `Export entrypoint "${entrypoint.specifier}" points to a file that could not be read.`,
        fix: "Fix the exports map or add the missing entrypoint file.",
      });
      continue;
    }

    if (!moduleStatus.hasModuleDoc) {
      issues.push({
        severity: "major",
        check: "module-docs",
        file: entrypoint.path,
        message:
          `Export entrypoint "${entrypoint.specifier}" is missing a top-level JSDoc block with @module.`,
        fix:
          "Add a top-of-file module JSDoc block that explains the entrypoint and includes `@module`.",
      });
    }

    const exportedSymbols = moduleStatus.exportedSymbols;
    if (exportedSymbols.length === 0) {
      issues.push({
        severity: "note",
        check: "symbol-docs",
        file: entrypoint.path,
        message:
          `Export entrypoint "${entrypoint.specifier}" has no directly detected exported symbols.`,
        fix: "If the entrypoint only re-exports symbols, audit the source modules too.",
      });
      continue;
    }

    const documentedCount = exportedSymbols.filter((symbol) => symbol.documented).length;
    const coverage = documentedCount / exportedSymbols.length;
    if (coverage < 0.8) {
      issues.push({
        severity: "major",
        check: "symbol-docs",
        file: entrypoint.path,
        message:
          `Only ${documentedCount}/${exportedSymbols.length} directly exported symbols appear to have JSDoc.`,
        fix:
          "Document public exported functions, classes, types, interfaces, constants, and errors with JSDoc.",
      });
    }

    for (const symbol of exportedSymbols) {
      if (!symbol.documented) {
        issues.push({
          severity: "minor",
          check: "symbol-docs",
          file: entrypoint.path,
          line: symbol.line,
          symbol: symbol.name,
          message: `Exported ${symbol.kind} "${symbol.name}" is missing nearby JSDoc.`,
          fix:
            "Add a short JSDoc comment that explains the public contract and any important failure behavior.",
        });
      }

      if (!symbol.explicitPublicType) {
        issues.push({
          severity: "major",
          check: "slow-types",
          file: entrypoint.path,
          line: symbol.line,
          symbol: symbol.name,
          message:
            `Exported ${symbol.kind} "${symbol.name}" may rely on inferred public types that can become JSR slow types.`,
          fix:
            "Add explicit return types, variable annotations, class member types, or a stable public interface.",
        });
      }
    }
  }

  const provenance = await inspectProvenance(root);
  if (!provenance.hasPublishWorkflow) {
    issues.push({
      severity: "minor",
      check: "provenance",
      message: "No GitHub Actions workflow using `deno publish` or `jsr publish` was detected.",
      fix: "Add a release workflow that publishes from GitHub Actions when provenance is desired.",
    });
  } else if (!provenance.hasOidcPermission) {
    issues.push({
      severity: "major",
      check: "provenance",
      file: provenance.workflowFiles.join(", "),
      message:
        "A publish workflow was detected, but it does not appear to grant `id-token: write` for OIDC provenance.",
      fix:
        "Add `permissions: { id-token: write, contents: read }` or equivalent workflow permissions.",
    });
  }

  if (
    await pathExists(joinFsPath(root, ".opencode")) &&
    !publishConfigMentionsOpencode(config.publish)
  ) {
    issues.push({
      severity: "minor",
      check: "publish-surface",
      file: configFile ?? undefined,
      message:
        "The repository has a local `.opencode/` directory, but the package config does not visibly exclude it from publishing.",
      fix:
        "Exclude local harness files using publish include/exclude settings or an equivalent repository ignore rule.",
    });
  }

  issues.push({
    severity: "note",
    check: "runtime-compatibility",
    file: configFile ?? undefined,
    message:
      "Runtime compatibility is partly controlled by package metadata and package-page claims, which this static audit cannot fully verify.",
    fix:
      "Confirm the JSR runtime compatibility settings match the APIs used by exported entrypoints.",
  });

  return {
    root,
    configFile,
    packageName,
    version,
    license,
    exports,
    readmeFile: readme?.file ?? null,
    readmeHasUsageExample,
    modules,
    provenance,
    issues,
  };
}

export function formatJsrAuditReport(report: JsrAuditReport): string {
  const counts = countIssues(report.issues);
  const readiness = counts.blocker > 0 || counts.major > 0
    ? "Needs work"
    : "Ready with manual confirmation";

  const moduleLines = report.modules.length === 0
    ? ["- No exported entrypoints inspected."]
    : report.modules.map((module) => {
      const symbols = module.exportedSymbols;
      const documented = symbols.filter((symbol) => symbol.documented).length;
      const typed = symbols.filter((symbol) => symbol.explicitPublicType).length;
      return [
        `- ${module.entrypoint.specifier} -> ${module.entrypoint.path}`,
        `  - file readable: ${module.exists ? "yes" : "no"}`,
        `  - @module docs: ${module.hasModuleDoc ? "yes" : "no"}`,
        `  - direct symbol docs: ${documented}/${symbols.length}`,
        `  - explicit public types: ${typed}/${symbols.length}`,
      ].join("\n");
    });

  const issueLines = report.issues.length === 0
    ? ["- None detected."]
    : report.issues.map(formatIssue);

  return [
    "### JSR score readiness",
    "",
    `- Status: ${readiness}`,
    `- Blockers: ${counts.blocker}`,
    `- Major issues: ${counts.major}`,
    `- Minor issues: ${counts.minor}`,
    `- Notes: ${counts.note}`,
    "",
    "### Package config",
    "",
    `- Config file: ${report.configFile ?? "not found"}`,
    `- Name: ${report.packageName ?? "not found"}`,
    `- Version: ${report.version ?? "not found"}`,
    `- License: ${report.license ?? "not found"}`,
    `- Exported entrypoints: ${report.exports.length}`,
    "",
    "### README",
    "",
    `- README: ${report.readmeFile ?? "not found"}`,
    `- Usage example detected: ${report.readmeHasUsageExample ? "yes" : "no"}`,
    "",
    "### Entrypoint docs and public API",
    "",
    ...moduleLines,
    "",
    "### Provenance",
    "",
    `- Workflow files scanned: ${report.provenance.workflowFiles.length}`,
    `- Publish workflow detected: ${report.provenance.hasPublishWorkflow ? "yes" : "no"}`,
    `- OIDC id-token permission detected: ${report.provenance.hasOidcPermission ? "yes" : "no"}`,
    "",
    "### Findings",
    "",
    ...issueLines,
    "",
    "### Recommended verification",
    "",
    "- `deno fmt --check`",
    "- `deno lint`",
    "- `deno check`",
    "- `deno test`",
    "- `deno doc --lint`",
    "- `deno publish --dry-run`",
  ].join("\n");
}

function formatIssue(issue: JsrAuditIssue): string {
  const location = [
    issue.file,
    issue.line ? `line ${issue.line}` : null,
    issue.symbol ? `symbol ${issue.symbol}` : null,
  ].filter((item): item is string => typeof item === "string").join(", ");

  return [
    `- [${issue.severity}] ${issue.check}${location ? ` (${location})` : ""}: ${issue.message}`,
    `  - Fix: ${issue.fix}`,
  ].join("\n");
}

function countIssues(issues: readonly JsrAuditIssue[]): Record<JsrIssueSeverity, number> {
  return {
    blocker: issues.filter((issue) => issue.severity === "blocker").length,
    major: issues.filter((issue) => issue.severity === "major").length,
    minor: issues.filter((issue) => issue.severity === "minor").length,
    note: issues.filter((issue) => issue.severity === "note").length,
  };
}

async function readPackageConfig(
  root: string,
): Promise<{ readonly file: string; readonly config: PackageConfig } | null> {
  for (const file of CONFIG_FILES) {
    const absolutePath = joinFsPath(root, file);
    if (!(await pathExists(absolutePath))) continue;

    const raw = await readFile(absolutePath, "utf8");
    const parsed = parseJsonLikeObject(raw);
    return {
      file,
      config: parsed,
    };
  }

  return null;
}

function parseJsonLikeObject(raw: string): PackageConfig {
  const parsed: unknown = JSON.parse(stripJsonComments(raw));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Package config must be a JSON object.");
  }

  return parsed as PackageConfig;
}

export function stripJsonComments(input: string): string {
  let output = "";
  let inString = false;
  let quote = "";
  let escaped = false;
  let index = 0;

  while (index < input.length) {
    const current = input[index];
    const next = input[index + 1];

    if (inString) {
      output += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === quote) {
        inString = false;
        quote = "";
      }
      index += 1;
      continue;
    }

    if (current === '"' || current === "'") {
      inString = true;
      quote = current;
      output += current;
      index += 1;
      continue;
    }

    if (current === "/" && next === "/") {
      index += 2;
      while (index < input.length && input[index] !== "\n") {
        index += 1;
      }
      continue;
    }

    if (current === "/" && next === "*") {
      index += 2;
      while (index < input.length && !(input[index] === "*" && input[index + 1] === "/")) {
        index += 1;
      }
      index += 2;
      continue;
    }

    output += current;
    index += 1;
  }

  return output;
}

function extractExports(value: unknown): JsrExportEntry[] {
  if (typeof value === "string") {
    return [{ specifier: ".", path: normalizeExportPath(value) }];
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const entries: JsrExportEntry[] = [];
  for (const [specifier, target] of Object.entries(value)) {
    if (typeof target === "string") {
      entries.push({
        specifier,
        path: normalizeExportPath(target),
      });
    }
  }

  return entries.sort((a, b) => a.specifier.localeCompare(b.specifier));
}

function normalizeExportPath(path: string): string {
  return normalizePath(path.replace(/^\.\//, ""));
}

async function inspectModule(
  root: string,
  entrypoint: JsrExportEntry,
): Promise<ModuleDocStatus> {
  const absolutePath = joinFsPath(root, entrypoint.path);
  if (!(await pathExists(absolutePath))) {
    return {
      entrypoint,
      exists: false,
      hasModuleDoc: false,
      exportedSymbols: [],
    };
  }

  const text = await readFile(absolutePath, "utf8");
  return {
    entrypoint,
    exists: true,
    hasModuleDoc: hasModuleDoc(text),
    exportedSymbols: findExportedSymbols(text),
  };
}

function hasModuleDoc(text: string): boolean {
  const top = text.slice(0, 4_000);
  return /\/\*\*[\s\S]*?@module\b[\s\S]*?\*\//.test(top);
}

export function findExportedSymbols(text: string): ExportedSymbol[] {
  const lines = text.split(/\r?\n/);
  const symbols: ExportedSymbol[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    const documented = hasJSDocBefore(lines, index);

    const functionMatch = line.match(
      /^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)(?:\s*<[^>]+>)?\s*\([^)]*\)\s*(?::\s*[^/{=]+)?/,
    );
    if (functionMatch) {
      symbols.push({
        name: functionMatch[1],
        kind: "function",
        line: lineNumber,
        documented,
        explicitPublicType: /\)\s*:\s*[^/{=]+/.test(line),
      });
      continue;
    }

    const classMatch = line.match(/^\s*export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)\b/);
    if (classMatch) {
      symbols.push({
        name: classMatch[1],
        kind: "class",
        line: lineNumber,
        documented,
        explicitPublicType: true,
      });
      continue;
    }

    const interfaceMatch = line.match(/^\s*export\s+interface\s+([A-Za-z_$][\w$]*)\b/);
    if (interfaceMatch) {
      symbols.push({
        name: interfaceMatch[1],
        kind: "interface",
        line: lineNumber,
        documented,
        explicitPublicType: true,
      });
      continue;
    }

    const typeMatch = line.match(/^\s*export\s+type\s+([A-Za-z_$][\w$]*)\b/);
    if (typeMatch) {
      symbols.push({
        name: typeMatch[1],
        kind: "type",
        line: lineNumber,
        documented,
        explicitPublicType: true,
      });
      continue;
    }

    const enumMatch = line.match(/^\s*export\s+enum\s+([A-Za-z_$][\w$]*)\b/);
    if (enumMatch) {
      symbols.push({
        name: enumMatch[1],
        kind: "enum",
        line: lineNumber,
        documented,
        explicitPublicType: true,
      });
      continue;
    }

    const variableMatch = line.match(/^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/);
    if (variableMatch) {
      symbols.push({
        name: variableMatch[1],
        kind: "variable",
        line: lineNumber,
        documented,
        explicitPublicType: /:\s*[^=]+/.test(line) || /\bsatisfies\b/.test(line),
      });
    }
  }

  return symbols;
}

function hasJSDocBefore(lines: readonly string[], lineIndex: number): boolean {
  let index = lineIndex - 1;

  while (index >= 0 && lines[index].trim() === "") {
    index -= 1;
  }

  if (index < 0 || !lines[index].includes("*/")) return false;

  let scanned = 0;
  while (index >= 0 && scanned < 25) {
    if (lines[index].includes("/**")) return true;
    index -= 1;
    scanned += 1;
  }

  return false;
}

async function inspectProvenance(root: string): Promise<JsrProvenanceStatus> {
  const workflowRoot = joinFsPath(root, ".github", "workflows");
  const workflowFiles = await listWorkflowFiles(workflowRoot);
  let hasPublishWorkflow = false;
  let hasOidcPermission = false;

  for (const file of workflowFiles) {
    const text = await readFile(joinFsPath(root, file), "utf8");
    if (/\b(?:deno|jsr)\s+publish\b/.test(text)) {
      hasPublishWorkflow = true;
    }

    if (/id-token\s*:\s*write/.test(text)) {
      hasOidcPermission = true;
    }
  }

  return {
    workflowFiles,
    hasPublishWorkflow,
    hasOidcPermission,
  };
}

async function listWorkflowFiles(workflowRoot: string): Promise<string[]> {
  if (!(await pathExists(workflowRoot))) return [];

  const files: string[] = [];
  const entries = await readdir(workflowRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/\.(?:ya?ml)$/i.test(entry.name)) continue;
    files.push(normalizePath(joinFsPath(".github", "workflows", entry.name)));
  }

  return files.sort((a, b) => a.localeCompare(b));
}

async function readFirstExisting(
  root: string,
  candidates: readonly string[],
): Promise<{ readonly file: string; readonly text: string } | null> {
  for (const file of candidates) {
    const absolutePath = joinFsPath(root, file);
    if (!(await pathExists(absolutePath))) continue;

    return {
      file,
      text: await readFile(absolutePath, "utf8"),
    };
  }

  return null;
}

function hasUsefulReadmeExample(text: string): boolean {
  const hasFence = /```(?:ts|typescript|js|javascript|bash|sh|shell)?[\s\S]*?```/.test(text);
  const hasImportOrInstall = /\b(import|deno\s+add|deno\s+run|jsr:|npm:)\b/i.test(text);
  return hasFence && hasImportOrInstall;
}

function publishConfigMentionsOpencode(value: unknown): boolean {
  if (!value) return false;
  return JSON.stringify(value).includes(".opencode");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function getEntrypointDirectory(entrypoint: JsrExportEntry): string {
  return dirname(entrypoint.path);
}

export function isJsTsEntrypoint(path: string): boolean {
  const dotIndex = path.lastIndexOf(".");
  const extension = dotIndex >= 0 ? path.slice(dotIndex) : "";
  return JS_TS_EXTENSIONS.has(extension);
}
