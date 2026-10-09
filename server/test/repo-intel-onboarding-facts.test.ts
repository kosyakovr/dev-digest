import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';

/**
 * L05 onboarding tour — `RepoIntel.getOnboardingFacts` (plan WP2.tests [T2];
 * AC-11, AC-14, A-3). No Postgres: the service's repository is replaced by a stub,
 * as in repo-intel-facade-degraded.test.ts.
 */

type Ranked = { path: string; rank: number };

function indexState(over: Partial<IndexState>): IndexState {
  return {
    repoId: 'r1',
    status: 'full',
    filesIndexed: 15,
    filesSkipped: 0,
    durationMs: 0,
    lastIndexedSha: 'abc1234',
    indexerVersion: 2,
    updatedAt: new Date(0),
    degraded: false,
    ...over,
  } as IndexState;
}

function serviceWith(opts: {
  flag?: boolean;
  state?: IndexState | null;
  ranked?: Ranked[];
  edges?: Array<{ fromFile: string; toFile: string }>;
  facts?: Array<{ filePath: string; endpoints: string[]; crons: string[] }>;
  edgesThrow?: boolean;
}): RepoIntelService {
  const svc = new RepoIntelService({ config: { repoIntelEnabled: opts.flag ?? true }, db: {} as never } as never);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    tryGetIndexState: async () => opts.state ?? null,
    // The real query orders by rank only (no tie-break), so keep the given order.
    getRankedPaths: async () => opts.ranked ?? [],
    getEdges: async () => {
      if (opts.edgesThrow) throw new Error('boom');
      return opts.edges ?? [];
    },
    getFileFacts: async () => opts.facts ?? [],
  };
  return svc;
}

describe('RepoIntel.getOnboardingFacts — ranking and reading path (AC-11)', () => {
  const mid: Ranked[] = Array.from({ length: 12 }, (_, i) => ({
    path: `src/m${String(i + 1).padStart(2, '0')}.ts`,
    rank: 0.3 - i * 0.01,
  }));
  // b.ts precedes a.ts on purpose: an equal-rank tie must be broken by path ascending.
  const ranked: Ranked[] = [
    { path: 'src/x.test.ts', rank: 0.9 },
    { path: 'b.ts', rank: 0.5 },
    { path: 'a.ts', rank: 0.5 },
    ...mid,
  ];

  it('lists a.ts before b.ts, leaves tests out and stops at 10 files', async () => {
    const facts = await serviceWith({ state: indexState({}), ranked }).getOnboardingFacts('r1');

    expect(facts.usable).toBe(true);
    expect(facts.readingPath).toHaveLength(10);
    expect(facts.readingPath[0]).toBe('a.ts');
    expect(facts.readingPath[1]).toBe('b.ts');
    expect(facts.readingPath).not.toContain('src/x.test.ts');
    expect(facts.readingPath.slice(2)).toEqual(mid.slice(0, 8).map((r) => r.path));
  });

  it('returns every ranked file sorted rank descending, then path ascending, tests included', async () => {
    const facts = await serviceWith({ state: indexState({}), ranked }).getOnboardingFacts('r1');

    expect(facts.files.map((f) => f.path)).toEqual([
      'src/x.test.ts',
      'a.ts',
      'b.ts',
      ...mid.map((r) => r.path),
    ]);
    expect(facts.files[1]).toEqual({ path: 'a.ts', rank: 0.5 });
  });

  it('reports the index sha and file count, edges as importer to imported, and only non-empty endpoints', async () => {
    const facts = await serviceWith({
      state: indexState({ lastIndexedSha: 'abc1234', filesIndexed: 15 }),
      ranked,
      edges: [{ fromFile: 'a.ts', toFile: 'b.ts' }],
      facts: [
        { filePath: 'a.ts', endpoints: ['GET /x'], crons: [] },
        { filePath: 'b.ts', endpoints: [], crons: ['nightly'] },
      ],
    }).getOnboardingFacts('r1');

    expect(facts.indexedSha).toBe('abc1234');
    expect(facts.filesIndexed).toBe(15);
    expect(facts.edges).toEqual([{ from: 'a.ts', to: 'b.ts' }]);
    expect(facts.endpointsByFile).toEqual({ 'a.ts': ['GET /x'] });
    expect(facts.status).toBe('full');
    expect(facts.reason).toBeUndefined();
  });
});

describe('RepoIntel.getOnboardingFacts — degradation (AC-14, A-3)', () => {
  const emptyLists = {
    files: [],
    readingPath: [],
    criticalPaths: [],
    edges: [],
    endpointsByFile: {},
  };

  it('flag off → none / flag_off, unusable, with empty lists', async () => {
    const facts = await serviceWith({ flag: false, state: indexState({}), ranked: [{ path: 'a.ts', rank: 1 }] }).getOnboardingFacts('r1');
    expect(facts).toMatchObject({ status: 'none', reason: 'flag_off', usable: false, ...emptyLists });
  });

  it('no index row → none / no_data, unusable, empty sha', async () => {
    const facts = await serviceWith({ state: null }).getOnboardingFacts('r1');
    expect(facts).toMatchObject({ status: 'none', reason: 'no_data', usable: false, indexedSha: '', ...emptyLists });
  });

  it('a failed index keeps its stored reason and lists nothing', async () => {
    const facts = await serviceWith({
      state: indexState({ status: 'failed', degraded: true, degradedReason: 'repo_too_large' }),
      ranked: [{ path: 'a.ts', rank: 1 }],
    }).getOnboardingFacts('r1');
    expect(facts).toMatchObject({ status: 'failed', reason: 'repo_too_large', usable: false, ...emptyLists });
  });

  it('a degraded index without a stored reason says index_failed', async () => {
    const facts = await serviceWith({ state: indexState({ status: 'degraded', degraded: true }) }).getOnboardingFacts('r1');
    expect(facts).toMatchObject({ status: 'degraded', reason: 'index_failed', usable: false });
  });

  it('a partial index is usable, says index_partial and still lists files', async () => {
    const facts = await serviceWith({
      state: indexState({ status: 'partial' }),
      ranked: [{ path: 'a.ts', rank: 1 }],
    }).getOnboardingFacts('r1');
    expect(facts).toMatchObject({ status: 'partial', reason: 'index_partial', usable: true });
    expect(facts.files).toEqual([{ path: 'a.ts', rank: 1 }]);
  });

  it('never throws: a repository failure resolves to none / no_data', async () => {
    const facts = await serviceWith({ state: indexState({}), ranked: [{ path: 'a.ts', rank: 1 }], edgesThrow: true }).getOnboardingFacts('r1');
    expect(facts).toMatchObject({ status: 'none', reason: 'no_data', usable: false, ...emptyLists });
  });
});
