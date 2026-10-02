import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockLLMProvider,
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { ReviewService } from '../src/modules/reviews/service.js';
import { IntentService } from '../src/modules/intent/service.js';
import type { Logger } from '../src/modules/reviews/run-executor.js';
import type { AgentRow } from '../src/db/rows.js';

/**
 * Safe prompt-assembly logging, end to end (server/specs/L03-prompt-logging.md
 * AC-1..AC-4, AC-6, AC-10). A real Postgres, the real executor / intent service /
 * RunLogger / prompt-log, a mock LLM and git, and a capturing logger that
 * implements `child`. The sentinels below are the content that must never reach
 * the captured pino output; the tests assert they are absent from every line.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';
const DIFF_SENTINEL = 'DIFF-BODY-SENTINEL-9';
const SPEC_SENTINEL = 'SPEC-CONTENT-SENTINEL-7';
const PR_BODY_SENTINEL = 'PR-BODY-SENTINEL-5';
const ISSUE_SENTINEL = 'ISSUE-BODY-SENTINEL-3';
const KEPT_TITLE = 'FINDING-TITLE-SENTINEL-8';
const DROPPED_TITLE = 'SPEC-SENTINEL-42 phantom finding';
/** Everything here is content; none of it may appear in captured pino output. */
const NEVER_LOGGED = [AWS_KEY, DIFF_SENTINEL, SPEC_SENTINEL, PR_BODY_SENTINEL, ISSUE_SENTINEL, KEPT_TITLE, 'SPEC-SENTINEL-42'];

const HEAD = 'a1b2c3d4';
const SPEC_PATH = 'docs/specs/x.md';

const DIFF = [
  'diff --git a/src/config.ts b/src/config.ts',
  '--- a/src/config.ts',
  '+++ b/src/config.ts',
  '@@ -10,3 +10,5 @@',
  '   port: 3000,',
  `+  awsKey: "${AWS_KEY}",`,
  `+  // ${DIFF_SENTINEL}`,
  '   redisUrl: x,',
  'diff --git a/src/b.ts b/src/b.ts',
  '--- a/src/b.ts',
  '+++ b/src/b.ts',
  '@@ -1,1 +1,2 @@',
  ' keep',
  '+const b = 2;',
  'diff --git a/src/c.ts b/src/c.ts',
  '--- a/src/c.ts',
  '+++ b/src/c.ts',
  '@@ -1,1 +1,2 @@',
  ' keep',
  '+const c = 3;',
].join('\n');

const REVIEW_FIXTURE = {
  verdict: 'request_changes',
  summary: 'An AWS key is committed.',
  score: 40,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: KEPT_TITLE,
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live key is committed in source.',
      confidence: 0.95,
      kind: 'finding',
    },
    {
      id: 'f-halluc',
      severity: 'WARNING',
      category: 'bug',
      title: DROPPED_TITLE,
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'This line is not in the diff.',
      confidence: 0.5,
      kind: 'finding',
    },
  ],
};

const CLASSIFICATION = {
  evidence: [{ source: 'description', quote: 'rate limiting' }],
  intent: 'Add rate limiting to the public API',
  in_scope: ['api'],
  out_of_scope: ['billing'],
  sources_conflict: false,
};

type Line = { level: string; obj: Record<string, unknown>; msg: string };

/** A logger that records every call, with `child` bindings merged into each object. */
function captureLogger() {
  const lines: Line[] = [];
  const make = (bindings: Record<string, unknown>): Logger => {
    const rec = (level: string) => (obj: unknown, msg?: string) =>
      lines.push({
        level,
        obj: { ...bindings, ...(obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : {}) },
        msg: msg ?? '',
      });
    return {
      info: rec('info'),
      warn: rec('warn'),
      error: rec('error'),
      debug: rec('debug'),
      child: (b) => make({ ...bindings, ...b }),
    };
  };
  return { lines, logger: make({}) };
}

const dump = (lines: Line[]) => lines.map((l) => JSON.stringify({ obj: l.obj, msg: l.msg })).join('\n');

function allKeys(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      allKeys(x, out);
    }
  }
  return out;
}

d('prompt-assembly logging (pg + capturing logger)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** Hermetic env: nothing from process.env (no real keys, no real NODE_ENV). */
  const cfg = (extra: Record<string, string> = {}) => loadConfig({ NODE_ENV: 'test', ...extra });

  function appWith(config: ReturnType<typeof cfg>) {
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        embedder: new MockEmbedder(),
        git: new MockGitClient({
          diff: DIFF,
          filesAtRef: { [`${HEAD}:${SPEC_PATH}`]: `# Plan\n${SPEC_SENTINEL} the plan body.` },
        }),
        github: new MockGitHubClient({
          issues: { 12: { number: 12, title: 'Throttle the API', body: `${ISSUE_SENTINEL} details`, state: 'open' } },
        }),
        llm: {
          openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }),
          openrouter: new MockLLMProvider('openai', {
            structuredBySchema: { PrIntentClassification: CLASSIFICATION },
          }),
        },
      },
    });
  }

  async function setupPr() {
    const db = pg.handle.db;
    const name = `plog-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 482,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: HEAD,
        additions: 3,
        deletions: 0,
        filesCount: 3,
        status: 'needs_review',
        body: `${PR_BODY_SENTINEL} adds rate limiting. See ${SPEC_PATH} for the plan. Closes #12.`,
      })
      .returning();
    return pr!;
  }

  async function makeAgents(): Promise<AgentRow[]> {
    const mk = (name: string, strategy: 'single-pass' | 'map-reduce') =>
      pg.handle.db
        .insert(t.agents)
        .values({
          workspaceId,
          name: `${name}-${seq++}`,
          provider: 'openai',
          model: 'gpt-4.1',
          systemPrompt: 'You are the SECURITY agent.',
          strategy,
        })
        .returning()
        .then((r) => r[0]!);
    return [await mk('Single', 'single-pass'), await mk('MapReduce', 'map-reduce')];
  }

  /** Run one review batch and wait until every agent has logged its end line. */
  async function batch(config: ReturnType<typeof cfg>) {
    const app = await appWith(config);
    const pr = await setupPr();
    const agents = await makeAgents();
    const { lines, logger } = captureLogger();
    const { runs } = await new ReviewService(app.container).runReview(workspaceId, pr.id, agents, logger);
    const deadline = Date.now() + 30_000;
    const ended = () =>
      lines.filter((l) => /^review: agent ".*" (done|failed|cancelled)/.test(l.msg)).length;
    while (ended() < agents.length && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
    expect(ended(), 'every agent must finish').toBe(agents.length);
    return { app, pr, agents, runs, lines };
  }

  const assembled = (lines: Line[], kind: string) =>
    lines.filter((l) => l.msg === 'prompt: assembled' && l.obj.kind === kind);
  const details = (lines: Line[], kind: string) =>
    lines.filter((l) => l.msg === 'prompt: detail' && l.obj.kind === kind);

  // ---------------------------------------------------------------- default

  describe('default mode', () => {
    let run: Awaited<ReturnType<typeof batch>>;
    beforeAll(async () => {
      run = await batch(cfg());
    });

    it('AC-1: no secret, diff body, spec text, PR body, issue body or finding title in any captured line', () => {
      const out = dump(run.lines);
      expect(run.lines.length).toBeGreaterThan(5);
      for (const needle of NEVER_LOGGED) expect(out, needle).not.toContain(needle);
    });

    it('AC-2: one prompt: assembled per agent run and one for the intent derivation', () => {
      const reviews = assembled(run.lines, 'review');
      expect(reviews).toHaveLength(2);
      expect(reviews.map((l) => l.obj.agent).sort()).toEqual(run.agents.map((a) => a.name).sort());
      const intents = assembled(run.lines, 'intent');
      expect(intents).toHaveLength(1);
      expect(intents[0]!.obj.trigger).toBe('review');
    });

    it('AC-2: each line has provider, model, kind and sections with name/source/trust/chars/tokensEst, and no sha256 / preview / order / chunk', () => {
      for (const l of [...assembled(run.lines, 'review'), ...assembled(run.lines, 'intent')]) {
        expect(typeof l.obj.correlationId).toBe('string');
        expect(l.obj.provider).toEqual(expect.any(String));
        expect(l.obj.model).toEqual(expect.any(String));
        const sections = l.obj.sections as Record<string, unknown>[];
        expect(sections.length).toBeGreaterThan(2);
        for (const s of sections) {
          expect(s).toMatchObject({
            name: expect.any(String),
            source: expect.any(String),
            trust: expect.stringMatching(/^(trusted|untrusted)$/),
            chars: expect.any(Number),
            tokensEst: expect.any(Number),
          });
          expect(s.tokensEst).toBe(Math.ceil((s.chars as number) / 4));
        }
        const keys = allKeys(l.obj);
        for (const k of ['sha256', 'preview', 'order', 'chunk']) expect(keys).not.toContain(k);
      }
      const review = assembled(run.lines, 'review')[0]!;
      expect(review.obj).toMatchObject({ provider: 'openai', model: 'gpt-4.1' });
      const intent = assembled(run.lines, 'intent')[0]!;
      expect(intent.obj).toMatchObject({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' });
    });

    it('describes the review prompt sections (intent slot included) and the intent sources by ref', () => {
      const names = (assembled(run.lines, 'review')[0]!.obj.sections as { name: string }[]).map((s) => s.name);
      expect(names.slice(0, 2)).toEqual(['system', 'injection_guard']);
      expect(names[names.length - 1]).toBe('diff');
      for (const n of ['task', 'pr_description', 'intent']) expect(names).toContain(n);
      const intentSections = assembled(run.lines, 'intent')[0]!.obj.sections as { name: string; ref?: string }[];
      expect(intentSections.find((s) => s.name === 'ticket')?.ref).toBe('#12');
      expect(intentSections.find((s) => s.name === 'spec')?.ref).toBe(SPEC_PATH);
    });

    it('AC-3: the intent lines and every agent line share one correlationId (a UUID)', () => {
      const ids = new Set(
        run.lines
          .filter((l) => /^(prompt: assembled|intent: derived|review: batch started|review: agent)/.test(l.msg))
          .map((l) => l.obj.correlationId),
      );
      expect(ids.size).toBe(1);
      expect([...ids][0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      const derived = run.lines.find((l) => l.msg === 'intent: derived')!;
      expect(derived.obj.inputHash).toMatch(/^[0-9a-f]{12}$/);
    });

    it('AC-6 default: map-reduce over 3 files logs 1 info line and no debug line', () => {
      const mr = assembled(run.lines, 'review').find((l) => String(l.obj.agent).startsWith('MapReduce'))!;
      expect(mr.obj).toMatchObject({ strategy: 'map-reduce', chunks: 3 });
      // (RunLogger "tool" events already mirror at debug; only the prompt lines are new.)
      expect(run.lines.filter((l) => l.msg === 'prompt: detail')).toEqual([]);
    });

    it('AC-10: the dropped finding title is on the run trace, while pino has only a generic line', async () => {
      const trace = await new ReviewService(run.app.container).getRunTrace(run.runs[0]!.run_id);
      expect(trace!.log.some((l) => l.msg.includes('SPEC-SENTINEL-42'))).toBe(true);
      const mirror = run.lines.filter((l) => l.msg.startsWith('grounding dropped'));
      expect(mirror.length).toBeGreaterThanOrEqual(1);
      for (const l of mirror) expect(l.msg).toBe('grounding dropped 1 finding(s) (reason: line not in diff)');
      expect(dump(run.lines)).not.toContain('SPEC-SENTINEL-42');
    });

    it('AC-2: a second batch on the same head reuses the stored intent: cache hit, no new intent prompt line', async () => {
      const { lines, logger } = captureLogger();
      const agents = [run.agents[0]!];
      await new ReviewService(run.app.container).runReview(workspaceId, run.pr.id, agents, logger);
      const deadline = Date.now() + 30_000;
      while (!lines.some((l) => /^review: agent ".*" (done|failed)/.test(l.msg)) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(assembled(lines, 'intent')).toHaveLength(0);
      expect(assembled(lines, 'review')).toHaveLength(1);
      const hit = lines.find((l) => l.msg === 'intent: cache hit')!;
      expect(hit.obj.inputHash).toMatch(/^[0-9a-f]{12}$/);
      // A new batch gets a new correlation id.
      const firstId = run.lines.find((l) => l.msg === 'review: batch started')!.obj.correlationId;
      expect(lines.find((l) => l.msg === 'review: batch started')!.obj.correlationId).not.toBe(firstId);
    });
  });

  // ---------------------------------------------------------------- verbose

  describe('verbose mode (NODE_ENV=test + DEVDIGEST_PROMPT_LOG=verbose)', () => {
    let run: Awaited<ReturnType<typeof batch>>;
    beforeAll(async () => {
      run = await batch(cfg({ DEVDIGEST_PROMPT_LOG: 'verbose' }));
    });

    it('AC-1: still no secret, diff body, spec text, PR body, issue body or finding title', () => {
      const out = dump(run.lines);
      expect(details(run.lines, 'review').length).toBeGreaterThanOrEqual(1);
      for (const needle of NEVER_LOGGED) expect(out, needle).not.toContain(needle);
    });

    it('AC-6 verbose: map-reduce over 3 files logs 1 info line and 3 prompt: detail lines', () => {
      const mrName = run.agents.find((a) => a.name.startsWith('MapReduce'))!.name;
      const mine = (ls: Line[]) => ls.filter((l) => l.obj.agent === mrName);
      expect(mine(assembled(run.lines, 'review'))).toHaveLength(1);
      const det = mine(details(run.lines, 'review'));
      expect(det).toHaveLength(3);
      expect(det.map((l) => l.obj.chunk)).toEqual([
        { index: 0, of: 3, label: 'src/config.ts' },
        { index: 1, of: 3, label: 'src/b.ts' },
        { index: 2, of: 3, label: 'src/c.ts' },
      ]);
      expect(det.every((l) => l.level === 'debug')).toBe(true);
    });

    it('a single-pass agent and the intent derivation each log one detail line', () => {
      const singleName = run.agents.find((a) => a.name.startsWith('Single'))!.name;
      expect(details(run.lines, 'review').filter((l) => l.obj.agent === singleName)).toHaveLength(1);
      expect(details(run.lines, 'intent')).toHaveLength(1);
    });

    it('AC-7: a preview only on the system section, masked/short; hashes present; info lines stay clean', () => {
      for (const l of [...details(run.lines, 'review'), ...details(run.lines, 'intent')]) {
        const secs = l.obj.sections as { name: string; preview?: string; sha256?: string }[];
        expect(secs.filter((s) => 'preview' in s).map((s) => s.name)).toEqual(['system']);
        expect(secs[0]!.preview!.length).toBeLessThanOrEqual(121);
        for (const s of secs) expect(s.sha256).toMatch(/^[0-9a-f]{12}$/);
      }
      const reviewDetail = details(run.lines, 'review')[0]!;
      expect((reviewDetail.obj.sections as { preview?: string }[])[0]!.preview).toBe('You are the SECURITY agent.');
      for (const l of [...assembled(run.lines, 'review'), ...assembled(run.lines, 'intent')]) {
        const keys = allKeys(l.obj);
        for (const k of ['sha256', 'preview', 'order', 'chunk']) expect(keys).not.toContain(k);
      }
    });

    it('AC-3: detail lines carry the same correlationId as the info lines', () => {
      const ids = new Set(
        run.lines.filter((l) => l.msg.startsWith('prompt: ')).map((l) => l.obj.correlationId),
      );
      expect(ids.size).toBe(1);
    });

    it('AC-10: no dropped-finding title in pino in verbose mode either', () => {
      expect(run.lines.some((l) => l.msg.startsWith('grounding dropped'))).toBe(true);
      expect(dump(run.lines)).not.toContain('SPEC-SENTINEL-42');
    });
  });

  // ------------------------------------------------------- manual derivation

  describe('manual intent derivation (AC-4)', () => {
    it('logs prompt: assembled with the correlationId of the logger it was given, once, with trigger manual', async () => {
      const app = await appWith(cfg());
      const pr = await setupPr();
      const { lines, logger } = captureLogger();
      await new IntentService(app.container).derive(workspaceId, pr.id, logger.child!({ correlationId: 'req-1' }));
      const a = assembled(lines, 'intent');
      expect(a).toHaveLength(1);
      expect(a[0]!.obj).toMatchObject({ correlationId: 'req-1', trigger: 'manual' });
      const derived = lines.find((l) => l.msg === 'intent: derived')!;
      expect(derived.obj.correlationId).toBe('req-1');
      for (const needle of NEVER_LOGGED) expect(dump(lines), needle).not.toContain(needle);
    });
  });
});
