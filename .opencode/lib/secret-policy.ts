export const SECRET_FILE_PATTERNS = [
  /\.env(?:\.[^/]+)?$/i,
  /(^|\/)\.env$/i,
  /\.pem$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /(^|\/)id_(rsa|ed25519)$/i,
  /(^|\/)credentials\.json$/i,
  /(^|\/)\.npmrc$/i,
] as const;

export const SAFE_SECRET_EXCEPTIONS = [
  /\.env\.example$/i,
  /\.env\.sample$/i,
  /\.env\.template$/i,
] as const;

export function looksSecret(path: string): boolean {
  if (SAFE_SECRET_EXCEPTIONS.some((pattern) => pattern.test(path))) {
    return false;
  }

  return SECRET_FILE_PATTERNS.some((pattern) => pattern.test(path));
}

export function looksLikeSecretShellRead(command: string): boolean {
  const lower = command.toLowerCase();

  if (/\b(printenv|env)\b/.test(lower)) {
    return true;
  }

  if (!/\b(cat|sed|awk|grep|rg|less|more|head|tail)\b/.test(lower)) {
    return false;
  }

  const pathishTokens = command
    .split(/\s+/)
    .map((token) => token.replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);

  return pathishTokens.some(looksSecret);
}
