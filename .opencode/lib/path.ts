import { isAbsolute, relative, resolve, sep } from "node:path";

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/+/g, "/");
}

export function joinPath(...parts: readonly string[]): string {
  const filtered = parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== ".");
  if (filtered.length === 0) return ".";
  return normalizePath(filtered.join("/"));
}

export function dirname(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  if (index < 0) return ".";
  if (index === 0) return "/";
  return normalized.slice(0, index);
}

export function basename(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index < 0 ? normalized : normalized.slice(index + 1);
}

export function extname(path: string): string {
  const name = basename(path);
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index);
}

export function stripExtension(path: string): string {
  const extension = extname(path);
  return extension.length === 0 ? path : path.slice(0, -extension.length);
}

export function resolveInside(root: string, requested?: string): string {
  if (!requested || requested === ".") return resolve(root);

  if (isAbsolute(requested)) {
    throw new Error("Path must be relative to the current worktree.");
  }

  const base = resolve(root);
  const target = resolve(base, requested);
  const rel = relative(base, target);

  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return target;
  }

  throw new Error("Path must stay inside the current worktree.");
}

export function isInside(parent: string, child: string): boolean {
  const base = resolve(parent);
  const target = resolve(child);
  const rel = relative(base, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function toRelativePath(root: string, child: string): string {
  return normalizePath(relative(resolve(root), resolve(child)) || ".");
}

export function platformPath(path: string): string {
  return sep === "/" ? normalizePath(path) : path.replaceAll("/", sep);
}
