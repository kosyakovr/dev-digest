import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { Review } from '@devdigest/shared';
import {
  MockPrBlast,
  MockPrIntent,
  MockLLMProvider,
  MockGitClient,
  MockGitHubClient,
  MockCodeIndex,
  MockEmbedder,
} from '../src/adapters/mocks.js';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';
import { assemblePrompt } from '../src/platform/prompt.js';
import { groundFindings } from '../src/platform/grounding.js';
import { estimateCost } from '../src/adapters/llm/pricing.js';

describe('mock adapters (no network)', () => {
  it('MockGitClient.diff parses into hunks with new line numbers', async () => {
    const git = new MockGitClient();
    const diff = await git.diff();
    expect(diff.files[0]!.path).toBe('src/config.ts');
    expect(diff.files[0]!.hunks[0]!.newLineNumbers.length).toBeGreaterThan(0);
  });

  it('MockGitHubClient records posted reviews and opened PRs', async () => {
    const gh = new MockGitHubClient();
    await gh.postReview({ owner: 'a', name: 'b' }, 482, { body: 'x', event: 'COMMENT' });
    expect(gh.posted).toHaveLength(1);
    const { url } = await gh.openPullRequest({ owner: 'a', name: 'b' }, {
      title: 't',
      head: 'h',
      base: 'main',
      body: 'b',
    });
    expect(url).toContain('github.com');
  });

  it('MockCodeIndex + MockEmbedder return deterministic shapes', async () => {
    const ci = new MockCodeIndex();
    expect((await ci.symbols({ owner: 'a', name: 'b' }))[0]!.name).toBe('rateLimit');
    const emb = await new MockEmbedder().embed(['a', 'b']);
    expect(emb[0]!).toHaveLength(1536);
  });
});

describe('GitClient.listFiles (L05)', () => {
  const repo = { owner: 'acme', name: 'app' };

  it('MockGitClient lists only the blobs recorded at the asked ref, without the ref prefix', async () => {
    const git = new MockGitClient({
      head: 'a1b2c3d4',
      filesAtRef: { 'a1b2c3d4:docs/a.md': 'a', 'ffff0000:docs/b.md': 'b' },
    });
    expect(await git.listFiles(repo, 'a1b2c3d4')).toEqual(['docs/a.md']);
    expect(await git.listFiles(repo, 'ffff0000')).toEqual(['docs/b.md']);
    expect(await git.listFiles(repo, 'deadbeef')).toEqual([]);
  });

  it('SimpleGitClient refuses a non-hex ref (no option or branch name reaches git)', async () => {
    const git = new SimpleGitClient('/nonexistent-clone-dir');
    await expect(git.listFiles(repo, 'HEAD')).rejects.toThrow(/invalid ref/i);
    await expect(git.listFiles(repo, '--output=/tmp/x')).rejects.toThrow(/invalid ref/i);
  });

  it('SimpleGitClient answers 422 "not cloned yet" when the clone directory is missing, not a raw simple-git error', async () => {
    // A repo cloned under another DEVDIGEST_CLONE_DIR has a clone_path but no directory here.
    const git = new SimpleGitClient('/nonexistent-clone-dir');
    const missing = { code: 'validation_error', statusCode: 422, message: 'This repository has not been cloned yet.' };
    await expect(git.currentHead(repo)).rejects.toMatchObject(missing);
    await expect(git.listFiles(repo, 'a1b2c3d4')).rejects.toMatchObject(missing);
  });

  it('SimpleGitClient also answers 422 for a clone directory without .git (a clone cut off mid-write)', async () => {
    // Without the .git check, git would climb to a parent repository (./clones sits inside this checkout).
    const root = await mkdtemp(join(tmpdir(), 'devdigest-git-'));
    try {
      await mkdir(join(root, repo.owner, repo.name), { recursive: true });
      const git = new SimpleGitClient(root);
      await expect(git.currentHead(repo)).rejects.toMatchObject({
        statusCode: 422,
        message: 'This repository has not been cloned yet.',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('MockGitHubClient — prior-PR history seams', () => {
  const ref = { owner: 'a', name: 'b' };
  const c1 = { sha: 'c1', message: 'Add x (#41)', date: '2026-03-01T00:00:00Z' };

  it('getPullSummary: a null entry rejects and the call is logged', async () => {
    const gh = new MockGitHubClient({ pullSummaries: { 7: null } });
    await expect(gh.getPullSummary(ref, 7)).rejects.toThrow();
    expect(gh.summaryCalls).toEqual([7]);
  });

  it('getPullSummary: a missing key yields a merged PR; a given entry is returned as is', async () => {
    const given = { number: 8, title: 'T', author: 'u', body: 'b', merged_at: '2026-02-02T00:00:00Z' };
    const gh = new MockGitHubClient({ pullSummaries: { 8: given } });
    const dflt = await gh.getPullSummary(ref, 9);
    expect(dflt.number).toBe(9);
    expect(dflt.merged_at).not.toBeNull();
    await expect(gh.getPullSummary(ref, 8)).resolves.toEqual(given);
  });

  it('listCommitsForPath: entry → commits, null → rejects, missing key → []', async () => {
    const gh = new MockGitHubClient({ commitsByPath: { 'a.ts': [c1], 'b.ts': null } });
    await expect(gh.listCommitsForPath(ref, 'a.ts', { ref: 'main', perPage: 30 })).resolves.toEqual([c1]);
    await expect(gh.listCommitsForPath(ref, 'b.ts', { ref: 'main', perPage: 30 })).rejects.toThrow();
    await expect(gh.listCommitsForPath(ref, 'c.ts', { ref: 'main', perPage: 30 })).resolves.toEqual([]);
  });

  it('listCommitsForPath logs path, ref and perPage per call, in order', async () => {
    const gh = new MockGitHubClient({ commitsByPath: { 'a.ts': [c1] } });
    await gh.listCommitsForPath(ref, 'a.ts', { ref: 'main', perPage: 30 });
    await gh.listCommitsForPath(ref, 'z.ts', { ref: 'dev', perPage: 5 });
    expect(gh.commitCalls).toEqual([
      { path: 'a.ts', ref: 'main', perPage: 30 },
      { path: 'z.ts', ref: 'dev', perPage: 5 },
    ]);
  });
});

describe('structured review pipeline (mock LLM → grounding)', () => {
  it('runs assemble → completeStructured(Review) → groundFindings end-to-end', async () => {
    // a fixture review where one finding is grounded and one is hallucinated
    const fixture = {
      verdict: 'request_changes',
      summary: 'secret key committed',
      score: 38,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          rationale: 'sk_live in diff',
          confidence: 0.98,
          kind: 'finding',
        },
        {
          id: 'f-hallucinated',
          severity: 'WARNING',
          category: 'bug',
          title: 'phantom finding on a line not in the diff',
          file: 'src/config.ts',
          start_line: 999,
          end_line: 999,
          rationale: 'not real',
          confidence: 0.3,
          kind: 'finding',
        },
      ],
    };
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const git = new MockGitClient();
    const diff = await git.diff();

    const { messages } = assemblePrompt({
      system: 'security reviewer',
      diff: diff.raw,
      task: 'Review PR #482',
    });
    const result = await llm.completeStructured({
      model: 'gpt-4.1',
      schema: Review,
      schemaName: 'Review',
      messages,
    });
    expect(result.data.findings).toHaveLength(2);

    const grounded = groundFindings(result.data.findings, diff);
    expect(grounded.kept).toHaveLength(1); // the real one survives
    expect(grounded.kept[0]!.id).toBe('f1');
    expect(grounded.dropped[0]!.finding.id).toBe('f-hallucinated');
    expect(llm.calls.find((c) => c.method === 'completeStructured')).toBeTruthy();
  });
});

describe('pricing / cost discipline', () => {
  it('estimates cost for known models and returns null for unknown', () => {
    expect(estimateCost('gpt-4o-mini', 1_000_000, 0)).toBeCloseTo(0.15, 5);
    expect(estimateCost('some-future-model', 1000, 1000)).toBeNull();
  });
});

describe('L05 Risk Brief test doubles', () => {
  const schema = z.object({}).passthrough();
  const req = { model: 'm', schema, schemaName: 'X', messages: [] };

  it('MockPrBlast returns the given objects and records one call each', async () => {
    const blast = { changed_symbols: [], downstream: [], summary: 'B' };
    const history = { history: [], degraded: true, reason: 'github_unavailable' as const };
    const mock = new MockPrBlast(blast, history);
    expect(await mock.getBlast('w1', 'p1')).toBe(blast);
    expect(await mock.getHistory('w1', 'p1')).toBe(history);
    expect(mock.blastCalls).toEqual([{ workspaceId: 'w1', prId: 'p1' }]);
    expect(mock.historyCalls).toEqual([{ workspaceId: 'w1', prId: 'p1' }]);
  });

  it('MockPrIntent.get resolves to {intent:null}; derive is not configured and rejects', async () => {
    const mock = new MockPrIntent();
    await expect(mock.get('w1', 'p1')).resolves.toEqual({ intent: null });
    await expect(mock.derive('w1', 'p1')).rejects.toThrow();
  });

  it('MockLLMProvider: costUsd null stays null, a number is returned, no option keeps 0.001', async () => {
    const asNull = await new MockLLMProvider('openai', { costUsd: null, structured: {} }).completeStructured(req);
    expect(asNull.costUsd).toBeNull();
    const given = await new MockLLMProvider('openai', { costUsd: 0.25, structured: {} }).completeStructured(req);
    expect(given.costUsd).toBe(0.25);
    const dflt = await new MockLLMProvider('openai', { structured: {} }).completeStructured(req);
    expect(dflt.costUsd).toBe(0.001);
    const completeNull = await new MockLLMProvider('openai', { costUsd: null }).complete({ model: 'm', messages: [] });
    expect(completeNull.costUsd).toBeNull();
  });
});
