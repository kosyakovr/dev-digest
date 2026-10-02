/**
 * AC-1b: the ring rules of mcp-server/AGENTS.md, checked statically over src/.
 * Comments are stripped first so docblocks that describe a rule do not trip it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const all = files(SRC).map((p) => ({ rel: relative(SRC, p).split('\\').join('/'), code: stripComments(readFileSync(p, 'utf8')) }));
const under = (prefix: string) => all.filter((f) => f.rel.startsWith(prefix));
/** `import … from 'x'`, `export … from 'x'`, bare `import 'x'` and `import('x')`. */
const imports = (code: string): string[] =>
  [
    ...code.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/g),
    ...code.matchAll(/(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g),
    ...code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((m) => m[1] ?? '');

describe('ring boundaries (src/)', () => {
  it('finds the source files', () => {
    expect(under('core/').length).toBeGreaterThan(0);
    expect(under('usecases/').length).toBeGreaterThan(0);
    expect(under('format/').length).toBeGreaterThan(0);
  });

  it('src/core imports only zod and files inside core', () => {
    for (const f of under('core/')) {
      for (const spec of imports(f.code)) {
        expect(spec === 'zod' || /^\.\/[a-z-]+\.ts$/.test(spec), `${f.rel} imports ${spec}`).toBe(true);
      }
    }
  });

  it('src/usecases and src/format never import adapters, the MCP SDK or tools, and never read the environment', () => {
    for (const f of [...under('usecases/'), ...under('format/')]) {
      for (const spec of imports(f.code)) {
        expect(spec, `${f.rel} imports ${spec}`).not.toMatch(/adapters\/|@modelcontextprotocol|tools\/|server\.ts|index\.ts/);
      }
      expect(f.code, f.rel).not.toMatch(/process\.env/);
      expect(f.code, f.rel).not.toMatch(/\bfetch\b/);
    }
  });

  it('only src/adapters/http/http.ts touches fetch', () => {
    const offenders = all.filter((f) => /\bfetch\b/.test(f.code)).map((f) => f.rel);
    expect(offenders).toEqual(['adapters/http/http.ts']);
  });

  it('nothing under src writes to stdout or uses console', () => {
    for (const f of all) {
      expect(f.code, f.rel).not.toMatch(/console\.|process\.stdout/);
    }
  });

  it('nothing imports from the server or reviewer-core packages', () => {
    for (const f of all) {
      for (const spec of imports(f.code)) expect(spec, `${f.rel} imports ${spec}`).not.toMatch(/\.\.\/(\.\.\/)*(server|reviewer-core)(\/|$)/);
    }
  });

  it('only src/index.ts reads process.env', () => {
    const offenders = all.filter((f) => /process\.env/.test(f.code)).map((f) => f.rel);
    expect(offenders).toEqual(['index.ts']);
  });
});
