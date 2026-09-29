/**
 * WP7.tests — the read use cases run without the SDK, `fetch`, or an
 * `McpServer` (onion-architecture §9 by analogy, AC-16).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeDevDigestApi } from '../../src/api/fake-api.js';
import { Resolver } from '../../src/resolve.js';
import { listAgents } from '../../src/use-cases/list-agents.js';
import { getFindings } from '../../src/use-cases/get-findings.js';
import { getConventions } from '../../src/use-cases/get-conventions.js';
import { GR_ID, GR_NAME, PR_ID, PR_LABEL, PR_TITLE, REPO_FULL_NAME, REPO_ID, makeFake } from '../helpers/fixtures.js';

describe('use cases run without the SDK, fetch or an McpServer', () => {
  it('listAgents returns the projected agents list', async () => {
    const fake = new FakeDevDigestApi();
    fake.agents = [{ id: GR_ID, name: GR_NAME, model: 'gpt-4o', enabled: true }];
    const resolver = new Resolver(fake);

    const out = await listAgents({ resolver }, { response_format: 'concise' }, new AbortController().signal);

    expect(out).toEqual({ agents: [{ id: GR_ID, name: GR_NAME, enabled: true, model: 'gpt-4o' }], count: 1 });
  });

  it('getFindings resolves the pr and returns its (empty) findings', async () => {
    const fake = makeFake();
    fake.reviews[PR_ID] = [];
    const resolver = new Resolver(fake);

    const out = await getFindings(
      { api: fake, resolver },
      { pr: 'acme/payments-api#482', limit: 20, response_format: 'concise' },
      new AbortController().signal,
    );

    expect(out).toMatchObject({ pr: PR_LABEL, pr_title: PR_TITLE, reviews: [], findings: [], total: 0 });
  });

  it('getConventions resolves the repo and returns its (empty) conventions', async () => {
    const fake = makeFake();
    fake.conventions[REPO_ID] = [];
    const resolver = new Resolver(fake);

    const out = await getConventions(
      { api: fake, resolver },
      { repo: 'acme/payments-api', status: 'accepted', response_format: 'concise' },
      new AbortController().signal,
    );

    expect(out).toMatchObject({ repo: REPO_FULL_NAME, conventions: [], total: 0 });
  });

  it('never imports the SDK or calls fetch(...) — use-cases/*.ts, resolve.ts, format.ts (AC-16)', () => {
    const srcRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../src');
    const files = [
      'resolve.ts',
      'format.ts',
      ...readdirSync(path.join(srcRoot, 'use-cases')).map((f) => `use-cases/${f}`),
    ];

    for (const relative of files) {
      const text = readFileSync(path.join(srcRoot, relative), 'utf8');
      expect(text, `${relative} must not mention @modelcontextprotocol`).not.toMatch(/@modelcontextprotocol/);
      expect(text, `${relative} must not call fetch(...)`).not.toMatch(/(^|[^A-Za-z_.])fetch\(/);
    }
  });
});
