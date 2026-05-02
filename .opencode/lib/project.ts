import {
  basename,
  dirname,
  extname,
  joinPath,
  normalizePath,
  stripExtension,
} from "./path.ts";

export interface AgentSuggestion {
  readonly name: string;
  readonly reason: string;
}

export const AGENT_NAMES = {
  lead: "deno-lead",
  implementer: "deno-implementer",
  criticalReviewer: "deno-critical-reviewer",
  architectureReviewer: "deno-architecture-reviewer",
  httpAuditor: "deno-http-auditor",
  performanceAuditor: "deno-performance-auditor",
  testStrategist: "deno-test-strategist",
  releaseManager: "deno-release-manager",
} as const;

const REVIEWABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
  ".go",
  ".rs",
  ".py",
  ".java",
  ".kt",
  ".swift",
  ".php",
  ".rb",
  ".cs",
  ".json",
  ".jsonc",
  ".toml",
  ".yaml",
  ".yml",
  ".md",
]);

const REVIEWABLE_FILENAMES = new Set([
  "deno.json",
  "deno.jsonc",
  "import_map.json",
  "package.json",
  "package-lock.json",
  "bun.lock",
  "bun.lockb",
  "tsconfig.json",
  "README.md",
  "Dockerfile",
]);

export const TEST_SUFFIXES = [
  ".test.ts",
  ".test.tsx",
  ".test.js",
  ".test.jsx",
  ".test.mts",
  ".test.cts",
  ".test.mjs",
  ".test.cjs",
  ".spec.ts",
  ".spec.tsx",
  ".spec.js",
  ".spec.jsx",
  ".spec.mts",
  ".spec.cts",
  ".spec.mjs",
  ".spec.cjs",
] as const;

const IGNORED_PREFIXES = [
  ".git/",
  ".opencode/.cache/",
  "node_modules/",
  "dist/",
  "build/",
  "coverage/",
  ".turbo/",
  ".next/",
  ".svelte-kit/",
  "vendor/",
] as const;

const IGNORED_SEGMENTS = IGNORED_PREFIXES.map((prefix) => `/${prefix}`);

export function isIgnoredPath(path: string): boolean {
  const normalized = normalizePath(path).replace(/^\.\//, "");
  return IGNORED_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    IGNORED_SEGMENTS.some((segment) => normalized.includes(segment));
}

export function isReviewableFile(path: string): boolean {
  const normalized = normalizePath(path);
  if (isIgnoredPath(normalized)) return false;
  if (REVIEWABLE_FILENAMES.has(basename(normalized))) return true;
  return REVIEWABLE_EXTENSIONS.has(extname(normalized));
}

export function isTestFile(path: string): boolean {
  const normalized = normalizePath(path);
  return TEST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export function candidateRelatedTestPaths(path: string): string[] {
  const normalized = normalizePath(path);

  if (isTestFile(normalized)) {
    return [normalized];
  }

  const withoutExtension = stripExtension(normalized);
  const currentDirectory = dirname(normalized);
  const currentFile = basename(withoutExtension);

  const candidates = new Set<string>();

  for (const suffix of TEST_SUFFIXES) {
    candidates.add(`${withoutExtension}${suffix}`);
    candidates.add(joinPath(currentDirectory, `${currentFile}${suffix}`));
    candidates.add(joinPath("tests", currentDirectory, `${currentFile}${suffix}`));
    candidates.add(joinPath("test", currentDirectory, `${currentFile}${suffix}`));
    candidates.add(joinPath("tests", `${currentFile}${suffix}`));
    candidates.add(joinPath("test", `${currentFile}${suffix}`));
  }

  return [...candidates];
}

export function getDirectoryBucket(path: string): string {
  const normalized = normalizePath(path);
  const parts = normalized.split("/");
  if (parts.length <= 2) return normalized;
  return parts.slice(0, 2).join("/");
}

export function scoreProjectFile(
  file: string,
  recentlyEditedPaths: readonly string[],
): number {
  const normalized = normalizePath(file);
  const parts = normalized.split("/");
  const fileName = parts.at(-1) ?? normalized;
  const depth = parts.length;
  const recentIndex = recentlyEditedPaths.lastIndexOf(normalized);

  let score = 0;

  if (recentIndex >= 0) score += 20 + recentIndex;
  if (depth <= 2) score += 8;
  if (/\/(src|app|server|packages|lib|routes|api|domain)\//.test(`/${normalized}`)) score += 6;
  if (/(index|route|router|controller|service|repo|repository|model|schema|config|client|server|handler|middleware)\./.test(fileName)) score += 10;
  if (isTestFile(fileName)) score -= 4;

  return score;
}

export function selectProjectContextFiles(
  files: readonly string[],
  recentlyEditedPaths: readonly string[],
  maxFiles: number,
): string[] {
  const unique = [...new Set(files.map(normalizePath))].filter(isReviewableFile);
  if (unique.length <= maxFiles) return unique;

  const scored = unique
    .map((file) => ({
      file,
      bucket: getDirectoryBucket(file),
      score: scoreProjectFile(file, recentlyEditedPaths),
    }))
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));

  const selected: string[] = [];
  const seenBuckets = new Set<string>();

  for (const item of scored) {
    if (selected.length >= maxFiles) break;
    if (seenBuckets.has(item.bucket)) continue;
    selected.push(item.file);
    seenBuckets.add(item.bucket);
  }

  for (const item of scored) {
    if (selected.length >= maxFiles) break;
    if (!selected.includes(item.file)) selected.push(item.file);
  }

  return selected;
}

export function suggestReviewAgents(
  changedFiles: readonly string[],
): AgentSuggestion[] {
  const normalized = changedFiles.map(normalizePath);
  const suggestions: AgentSuggestion[] = [
    {
      name: AGENT_NAMES.criticalReviewer,
      reason: "evaluate correctness, security, failure modes, test proof, and merge risk",
    },
  ];

  if (normalized.length >= 4 || spansMultipleBuckets(normalized) || normalized.some(isArchitectureRelatedPath)) {
    suggestions.push({
      name: AGENT_NAMES.architectureReviewer,
      reason: "changed files span structure, ownership, or dependency boundaries",
    });
  }

  if (normalized.some(isHttpRelatedPath)) {
    suggestions.push({
      name: AGENT_NAMES.httpAuditor,
      reason: "changed files touch HTTP, request/response, auth, route, or config boundaries",
    });
  }

  if (normalized.some(isPerformanceSensitivePath)) {
    suggestions.push({
      name: AGENT_NAMES.performanceAuditor,
      reason: "changed files touch streaming, file, list, search, cache, parser, or batch paths",
    });
  }

  if (!normalized.some(isTestFile)) {
    suggestions.push({
      name: AGENT_NAMES.testStrategist,
      reason: "source files changed without obvious test-file changes",
    });
  }

  return dedupeSuggestions(suggestions);
}

function spansMultipleBuckets(files: readonly string[]): boolean {
  return new Set(files.map(getDirectoryBucket)).size >= 3;
}

function isArchitectureRelatedPath(path: string): boolean {
  const value = normalizePath(path).toLowerCase();
  return /(deno\.jsonc?|import_map|package\.json|tsconfig|\/domain\/|\/adapter\/|\/client\/|\/lib\/|\/types?\/|\/schemas?\/|\/config\/|\/errors?\.)/.test(value);
}

function isHttpRelatedPath(path: string): boolean {
  const value = normalizePath(path).toLowerCase();
  return /(route|routes|http|api|handler|middleware|controller|server|request|response|auth|config)/.test(value);
}

function isPerformanceSensitivePath(path: string): boolean {
  const value = normalizePath(path).toLowerCase();
  return /(stream|queue|worker|job|batch|scan|search|index|cache|file|parser|import|export|sync|list|paginate|cursor|perf|performance|benchmark)/.test(value);
}

function dedupeSuggestions(
  suggestions: readonly AgentSuggestion[],
): AgentSuggestion[] {
  const seen = new Set<string>();
  const output: AgentSuggestion[] = [];

  for (const suggestion of suggestions) {
    if (seen.has(suggestion.name)) continue;
    seen.add(suggestion.name);
    output.push(suggestion);
  }

  return output;
}

export function formatAgentMention(name: string): string {
  return `@${name}`;
}

export function buildProjectReviewPrompt(
  changedFiles: readonly string[],
  reviewFiles: readonly string[],
): string {
  const suggestedAgents = suggestReviewAgents(changedFiles);
  const delegationList = suggestedAgents.length === 0
    ? "- None"
    : suggestedAgents.map((agent) => `- ${formatAgentMention(agent.name)} - ${agent.reason}`).join("\n");

  const referencedFiles = reviewFiles.length === 0
    ? "none"
    : reviewFiles.map((file) => `@${file}`).join(" ");

  const reviewFileList = reviewFiles.length === 0
    ? "- None"
    : reviewFiles.map((file) => `- @${file}`).join("\n");

  const omittedFiles = changedFiles.filter((file) => !reviewFiles.includes(file));
  const omittedFileList = omittedFiles.length === 0
    ? "- None"
    : omittedFiles.map((file) => `- ${file}`).join("\n");

  return [
    "Perform a strict project-level review of the current change set.",
    "",
    `Total changed files detected: ${changedFiles.length}`,
    "",
    `Referenced files for direct inspection: ${referencedFiles}`,
    "",
    "Preferred delegation:",
    delegationList,
    "",
    "Instructions:",
    "- Route through the suggested read-only subagents when task delegation is available.",
    "- Grade the work at the change-set level, not file-by-file theater.",
    "- Focus on correctness, security, ownership, validation, typing, performance, tests, and diff scope.",
    "- Do not make code changes.",
    "- Any grade below B+ must include concrete corrective work.",
    "- Call out specific files, symbols, code paths, and complexity hot spots.",
    "",
    "Use this output structure:",
    "",
    "## Overall grade",
    "- Grade: <A+|A|A-|B+|B|B-|C+|C|C-|D|F>",
    "- Verdict: <1-3 sentences>",
    "",
    "## Category grades",
    "- DRY / modularity / folders: <grade>",
    "- Memory safety / complexity: <grade>",
    "- Validation / typed failures: <grade>",
    "- Strong typing / interfaces: <grade>",
    "- Tests / proof: <grade>",
    "",
    "## What is good",
    "- <bullets>",
    "",
    "## What is weak",
    "- <bullets>",
    "",
    "## Must address before merge",
    "- Include only if any category or the overall grade is below B+.",
    "",
    "## Complexity and memory hot spots",
    "- <bullets>",
    "",
    "## Suggested next edits",
    "- <small, concrete changes>",
    "",
    "Referenced changed files:",
    reviewFileList,
    "",
    "Additional changed files not directly referenced:",
    omittedFileList,
  ].join("\n");
}
