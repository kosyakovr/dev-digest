import { describe, expect, it } from 'vitest';
import { renderConventions } from '../src/format/text.ts';
import { getConventions } from '../src/usecases/conventions.ts';
import { convention, FakeClock, REPO_ID, seededApi } from './fakes.ts';

function setup() {
  const clock = new FakeClock();
  const api = seededApi(clock);
  api.conventions = [
    convention({ id: 'a', rule: 'accepted rule', status: 'accepted' }),
    convention({ id: 'p', rule: 'pending rule', status: 'pending' }),
    convention({ id: 'r', rule: 'rejected rule', status: 'rejected' }),
  ];
  return { clock, api };
}

const BASE = { repo: 'acme/payments-api', limit: 30, offset: 0 } as const;

describe('getConventions', () => {
  it('returns only accepted conventions for status accepted', async () => {
    const { clock, api } = setup();
    const view = await getConventions({ api, clock }, { ...BASE, status: 'accepted' });
    const text = renderConventions(view, 'concise');
    expect(text).toContain('accepted rule');
    expect(text).not.toContain('pending rule');
    expect(text).not.toContain('rejected rule');
  });

  it('status all returns every convention', async () => {
    const { clock, api } = setup();
    const view = await getConventions({ api, clock }, { ...BASE, status: 'all' });
    expect(view.total).toBe(3);
    expect(view.items).toHaveLength(3);
  });

  it('points at the Conventions page when none are accepted', async () => {
    const { clock, api } = setup();
    api.conventions = [convention({ status: 'pending' })];
    const view = await getConventions({ api, clock }, { ...BASE, status: 'accepted' });
    expect(renderConventions(view, 'concise')).toContain('Conventions page');
  });

  it('reads conventions of the resolved repo and makes no other call', async () => {
    const { clock, api } = setup();
    await getConventions({ api, clock }, { ...BASE, status: 'all' });
    expect(api.of('listConventions')[0]?.args).toEqual([REPO_ID]);
    expect(api.calls.map((c) => c.method).sort()).toEqual(['listConventions', 'listRepos']);
  });

  it('pages the matching items', async () => {
    const { clock, api } = setup();
    api.conventions = Array.from({ length: 5 }, (_, i) =>
      convention({ id: `c${i}`, rule: `rule ${i}`, status: 'accepted' }),
    );
    const view = await getConventions({ api, clock }, { ...BASE, status: 'accepted', limit: 2, offset: 1 });
    expect(view.total).toBe(5);
    expect(view.items.map((c) => c.rule)).toEqual(['rule 1', 'rule 2']);
    expect(renderConventions(view, 'concise')).toContain('offset=3');
  });

  it('renders [category] "rule" — "evidence_path:evidence_line"', async () => {
    const { clock, api } = setup();
    api.conventions = [
      convention({ category: 'testing', rule: 'Mock the network', evidence_path: 'src/a.test.ts', evidence_line: 12 }),
    ];
    const text = renderConventions(
      await getConventions({ api, clock }, { ...BASE, status: 'accepted' }),
      'concise',
    );
    expect(text).toContain('[testing] "Mock the network" — "src/a.test.ts:12"');
    expect(text).toContain('Use response_format "detailed" for rationale, snippet, ids.');
  });

  it('detailed adds the rationale and snippet', async () => {
    const { clock, api } = setup();
    api.conventions = [convention({ rationale: 'because greppable', evidence_snippet: 'export const z = 1' })];
    const text = renderConventions(
      await getConventions({ api, clock }, { ...BASE, status: 'accepted' }),
      'detailed',
    );
    expect(text).toContain('because greppable');
    expect(text).toContain('export const z = 1');
    expect(text).not.toContain('Use response_format "detailed"');
  });
});
