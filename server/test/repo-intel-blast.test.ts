/**
 * RepoIntelService.getBlastRadius — persistent-index-only facade.
 * Oracles: plan "Contract → Семантика фасаду" and Test brief WP2.tests
 * (reasons per index state, 20-per-symbol cap, hop 2, no clone / codeIndex reads).
 * The service's `repo` is replaced with a stub, as in repo-intel-facade-degraded.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const readFileSpy = vi.hoisted(() => vi.fn());
vi.mock('node:fs/promises', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:fs/promises')>();
  return { ...orig, readFile: readFileSpy };
});

import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type {
  FullSymbolRow,
  ResolvedCallerRow,
} from '../src/modules/repo-intel/repository.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';

const codeIndexSymbols = vi.fn(async () => {
  throw new Error('codeIndex.symbols must not be called');
});
const codeIndexReferences = vi.fn(async () => {
  throw new Error('codeIndex.references must not be called');
});

function state(over: Partial<IndexState> = {}): IndexState {
  return {
    repoId: 'r1',
    status: 'full',
    filesIndexed: 10,
    filesSkipped: 0,
    durationMs: 1,
    lastIndexedSha: 'sha-full',
    indexerVersion: 2,
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...over,
  };
}

const sym = (path: string, name: string, line: number): FullSymbolRow => ({
  path,
  name,
  kind: 'function',
  line,
  endLine: line + 5,
  exported: true,
  signature: null,
});

const callerRow = (
  fromPath: string,
  toSymbol: string,
  declFile: string | null,
  line: number,
  rank: number,
): ResolvedCallerRow => ({ fromPath, toSymbol, declFile, line, rank });

interface Stub {
  tryGetIndexState: ReturnType<typeof vi.fn>;
  getSymbolRows: ReturnType<typeof vi.fn>;
  getResolvedCallers: ReturnType<typeof vi.fn>;
  getFileFacts: ReturnType<typeof vi.fn>;
}

function build(opts: {
  flag?: boolean;
  state?: IndexState | null;
  symbols?: FullSymbolRow[];
  /** One entry per getResolvedCallers call (hop 1, hop 2, …). */
  callers?: ResolvedCallerRow[][];
  facts?: { filePath: string; endpoints: string[]; crons: string[] }[];
}): { svc: RepoIntelService; stub: Stub } {
  const container = {
    config: { repoIntelEnabled: opts.flag ?? true },
    db: {} as never,
    codeIndex: { symbols: codeIndexSymbols, references: codeIndexReferences },
  } as never;
  const svc = new RepoIntelService(container);
  const symbols = opts.symbols ?? [];
  const callerCalls = [...(opts.callers ?? [])];
  const stub: Stub = {
    tryGetIndexState: vi.fn(async () => (opts.state === undefined ? state() : opts.state)),
    getSymbolRows: vi.fn(async (_repoId: string, paths: string[]) =>
      symbols.filter((s) => paths.includes(s.path)),
    ),
    getResolvedCallers: vi.fn(async () => callerCalls.shift() ?? []),
    getFileFacts: vi.fn(async () => opts.facts ?? []),
  };
  (svc as unknown as { repo: Stub }).repo = stub;
  return { svc, stub };
}

beforeEach(() => {
  readFileSpy.mockReset();
  readFileSpy.mockRejectedValue(new Error('readFile must not be called'));
  codeIndexSymbols.mockClear();
  codeIndexReferences.mockClear();
});

function expectNoCloneOrCodeIndexReads(): void {
  expect(readFileSpy).not.toHaveBeenCalled();
  expect(codeIndexSymbols).not.toHaveBeenCalled();
  expect(codeIndexReferences).not.toHaveBeenCalled();
}

describe('getBlastRadius — degraded reasons follow the index state', () => {
  it('flag off → flag_off, source none, empty arrays, repository untouched', async () => {
    const { svc, stub } = build({ flag: false });
    const r = await svc.getBlastRadius('r1', ['a.ts']);
    expect(r).toMatchObject({
      degraded: true,
      reason: 'flag_off',
      source: 'none',
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
    });
    expect(stub.tryGetIndexState).not.toHaveBeenCalled();
    expectNoCloneOrCodeIndexReads();
  });

  it('no repo_index_state row → no_data', async () => {
    const { svc } = build({ state: null });
    const r = await svc.getBlastRadius('r1', ['a.ts']);
    expect(r).toMatchObject({ degraded: true, reason: 'no_data', source: 'none', callers: [] });
  });

  it('failed without a degradedReason → index_failed, keeps indexedSha, symbols never queried', async () => {
    const { svc, stub } = build({ state: state({ status: 'failed', lastIndexedSha: 'abc123' }) });
    const r = await svc.getBlastRadius('r1', ['a.ts']);
    expect(r).toMatchObject({
      degraded: true,
      reason: 'index_failed',
      indexedSha: 'abc123',
      source: 'none',
      changedSymbols: [],
      callers: [],
    });
    expect(stub.getSymbolRows).not.toHaveBeenCalled();
  });

  it('degraded status with degradedReason repo_too_large → that reason', async () => {
    const { svc } = build({ state: state({ status: 'degraded', degradedReason: 'repo_too_large' }) });
    const r = await svc.getBlastRadius('r1', ['a.ts']);
    expect(r.reason).toBe('repo_too_large');
    expect(r.degraded).toBe(true);
    expect(r.source).toBe('none');
  });

  it('partial index returns data with degraded:true / index_partial / source index', async () => {
    const { svc } = build({
      state: state({ status: 'partial' }),
      symbols: [sym('src/a.ts', 'A', 1), sym('src/h.ts', 'handler', 1)],
      callers: [[callerRow('src/h.ts', 'A', 'src/a.ts', 10, 3)]],
    });
    const r = await svc.getBlastRadius('r1', ['src/a.ts']);
    expect(r.callers).toHaveLength(1);
    expect(r).toMatchObject({ degraded: true, reason: 'index_partial', source: 'index' });
  });

  it('full index → degraded false, no reason key, indexedSha from the state', async () => {
    const { svc } = build({
      symbols: [sym('src/a.ts', 'A', 1), sym('src/h.ts', 'handler', 1)],
      callers: [[callerRow('src/h.ts', 'A', 'src/a.ts', 10, 3)]],
    });
    const r = await svc.getBlastRadius('r1', ['src/a.ts']);
    expect(r.degraded).toBe(false);
    expect(r.reason).toBeUndefined();
    expect(r.source).toBe('index');
    expect(r.indexedSha).toBe('sha-full');
  });

  it('a usable index with empty changedFiles → empty arrays, source index', async () => {
    const { svc, stub } = build({});
    const r = await svc.getBlastRadius('r1', []);
    expect(r).toMatchObject({ changedSymbols: [], callers: [], source: 'index', degraded: false });
    expect(stub.getSymbolRows).not.toHaveBeenCalled();
  });

  it('a repository that throws never makes the facade throw (→ no_data)', async () => {
    const { svc, stub } = build({});
    stub.tryGetIndexState.mockRejectedValue(new Error('db down'));
    const r = await svc.getBlastRadius('r1', ['a.ts']);
    expect(r).toMatchObject({ degraded: true, reason: 'no_data', source: 'none' });
  });
});

describe('getBlastRadius — per-symbol cap', () => {
  it('caps each changed symbol at 20 depth-1 callers, best rank first; a small symbol keeps all 3', async () => {
    const symbols = [sym('src/a.ts', 'A', 1), sym('src/b.ts', 'B', 1)];
    const aRows: ResolvedCallerRow[] = [];
    for (let i = 1; i <= 25; i++) {
      const f = `src/ca${String(i).padStart(2, '0')}.ts`;
      symbols.push(sym(f, `fnA${i}`, 1));
      aRows.push(callerRow(f, 'A', 'src/a.ts', 5, i));
    }
    const bRows: ResolvedCallerRow[] = [];
    for (let i = 1; i <= 3; i++) {
      const f = `src/cb${i}.ts`;
      symbols.push(sym(f, `fnB${i}`, 1));
      bRows.push(callerRow(f, 'B', 'src/b.ts', 5, i));
    }
    const { svc } = build({ symbols, callers: [[...aRows, ...bRows], []] });
    const r = await svc.getBlastRadius('r1', ['src/a.ts', 'src/b.ts']);

    const a = r.callers.filter((c) => c.viaSymbol === 'A');
    const b = r.callers.filter((c) => c.viaSymbol === 'B');
    expect(a).toHaveLength(20);
    expect(a.every((c) => c.depth === 1 && c.through === null)).toBe(true);
    expect(Math.max(...a.map((c) => c.rank))).toBe(25);
    expect(Math.min(...a.map((c) => c.rank))).toBe(6);
    expect(b).toHaveLength(3);
    expectNoCloneOrCodeIndexReads();
  });
});

describe('getBlastRadius — hop 2', () => {
  const symbols = [
    sym('src/a.ts', 'A', 1),
    sym('src/h.ts', 'handler', 1),
    sym('src/r.ts', 'route', 1),
  ];

  it('adds callers of callers with depth 2 and through = the depth-1 name; facts cover both hops', async () => {
    const { svc, stub } = build({
      symbols,
      callers: [
        [callerRow('src/h.ts', 'A', 'src/a.ts', 10, 5)],
        [callerRow('src/r.ts', 'handler', 'src/h.ts', 7, 3)],
      ],
      facts: [{ filePath: 'src/r.ts', endpoints: ['GET /r'], crons: [] }],
    });
    const r = await svc.getBlastRadius('r1', ['src/a.ts']);

    expect(r.callers).toContainEqual(
      expect.objectContaining({
        file: 'src/r.ts',
        symbol: 'route',
        viaSymbol: 'A',
        through: 'handler',
        depth: 2,
        line: 7,
      }),
    );
    expect(r.callers.find((c) => c.depth === 1)).toMatchObject({
      file: 'src/h.ts',
      symbol: 'handler',
      viaSymbol: 'A',
      through: null,
    });
    const [, filesArg] = stub.getFileFacts.mock.calls[0]!;
    expect([...(filesArg as string[])].sort()).toEqual(['src/h.ts', 'src/r.ts']);
    expect(r.factsByFile?.['src/r.ts']?.endpoints).toEqual(['GET /r']);
    expectNoCloneOrCodeIndexReads();
  });

  it('asks hop 2 for the depth-1 file and name', async () => {
    const { svc, stub } = build({
      symbols,
      callers: [[callerRow('src/h.ts', 'A', 'src/a.ts', 10, 5)], []],
    });
    await svc.getBlastRadius('r1', ['src/a.ts']);
    expect(stub.getResolvedCallers).toHaveBeenCalledTimes(2);
    const [, files, names] = stub.getResolvedCallers.mock.calls[1]!;
    expect(files).toEqual(['src/h.ts']);
    expect(names).toEqual(['handler']);
  });

  it('drops a hop-2 row whose declFile matches but whose toSymbol does not', async () => {
    const { svc } = build({
      symbols,
      callers: [
        [callerRow('src/h.ts', 'A', 'src/a.ts', 10, 5)],
        [callerRow('src/r.ts', 'somethingElse', 'src/h.ts', 7, 3)],
      ],
    });
    const r = await svc.getBlastRadius('r1', ['src/a.ts']);
    expect(r.callers.filter((c) => c.depth === 2)).toEqual([]);
    expect(r.callers).toHaveLength(1);
  });

  it('drops a hop-2 row that resolves to a different file than the depth-1 caller', async () => {
    const { svc } = build({
      symbols,
      callers: [
        [callerRow('src/h.ts', 'A', 'src/a.ts', 10, 5)],
        [callerRow('src/r.ts', 'handler', 'src/other.ts', 7, 3)],
      ],
    });
    const r = await svc.getBlastRadius('r1', ['src/a.ts']);
    expect(r.callers.filter((c) => c.depth === 2)).toEqual([]);
  });

  it('does not expand a depth-1 caller found only by the basename fallback', async () => {
    // src/bin/run has no symbol rows, so the enclosing symbol falls back to the
    // basename "run" (a dot-free name, so only the "located" rule keeps it out of hop 2).
    const { svc, stub } = build({
      symbols: [sym('src/a.ts', 'A', 1)],
      callers: [[callerRow('src/bin/run', 'A', 'src/a.ts', 10, 5)]],
    });
    const r = await svc.getBlastRadius('r1', ['src/a.ts']);
    expect(r.callers).toHaveLength(1);
    expect(r.callers[0]).toMatchObject({ symbol: 'run', depth: 1 });
    expect(stub.getResolvedCallers).toHaveBeenCalledTimes(1);
  });

  it('does not repeat a hop-1 caller at depth 2 for the same root symbol', async () => {
    const { svc } = build({
      symbols,
      callers: [
        [callerRow('src/h.ts', 'A', 'src/a.ts', 10, 5)],
        // Two references from the same enclosing symbol collapse into one caller.
        [
          callerRow('src/r.ts', 'handler', 'src/h.ts', 7, 3),
          callerRow('src/r.ts', 'handler', 'src/h.ts', 8, 3),
        ],
      ],
    });
    const r = await svc.getBlastRadius('r1', ['src/a.ts']);
    expect(r.callers.filter((c) => c.depth === 2)).toHaveLength(1);
  });
});
