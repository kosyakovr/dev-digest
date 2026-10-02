/**
 * Runtime copy of the secret-shaped patterns (cross-cutting, pure — no I/O).
 * Used as a BACKUP layer on log output: the primary guarantee is that content
 * is never put into a log payload at all.
 *
 * Mirrors the Step 2 table in `.claude/agents/security-reviewer.md`; a unit test
 * parses that table and fails on any added, removed or diverging row.
 */
export const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'aws-key', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'google-api', re: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'generic-assignment', re: /(secret|key|token|password)\s*[:=]\s*['"][^'"]{8,}/g },
  { name: 'mongodb-uri', re: /mongodb(\+srv)?:\/\/[^:]+:[^@]+@/g },
  { name: 'postgres-uri', re: /postgres(ql)?:\/\/[^:/\s]+:[^@\s]+@/g },
  { name: 'private-key', re: /-----BEGIN .* PRIVATE KEY-----/g },
  { name: 'github-token', re: /gh[ps]_[A-Za-z0-9]{36,}/g },
  { name: 'npm-token', re: /npm_[A-Za-z0-9]{36}/g },
  { name: 'slack-token', re: /xox[bpsa]-[0-9a-zA-Z-]+/g },
  { name: 'llm-key', re: /sk-(ant-|or-|proj-)?[A-Za-z0-9_-]{20,}/g },
];

/** Replace every secret-shaped match with its first 4 chars + `…[masked]`. */
export function maskSecrets(text: string): string {
  let out = text;
  for (const { re } of SECRET_PATTERNS) {
    out = out.replace(re, (m) => `${m.slice(0, 4)}…[masked]`);
  }
  return out;
}
