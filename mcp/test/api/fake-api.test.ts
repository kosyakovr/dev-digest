/**
 * FakeDevDigestApi (ring ③, port double — production code imported only by
 * tests). ports.ts § error contract says every method 404s under its own
 * class for an unknown id; an unscripted fake call must honour that default
 * so a use case's stale-id retry path is exercised even when a test forgot
 * to script an error (backend-architecture-3). `script()` still overrides it.
 */
import { describe, expect, it } from 'vitest';
import { FakeDevDigestApi } from '../../src/api/fake-api.js';
import { NotFoundError, StaleIdError, StaleRepoIdError } from '../../src/errors.js';

// A bare FakeDevDigestApi (no makeFake() seeding) has no known ids at all —
// this id is "unknown" only because nothing registered it, not because of
// its shape.
const UNKNOWN_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

describe('FakeDevDigestApi — unscripted unknown-id defaults (backend-architecture-3)', () => {
  it('startReview throws StaleIdError with the E10 text for an unknown prId', async () => {
    const fake = new FakeDevDigestApi();
    const promise = fake.startReview(UNKNOWN_ID, UNKNOWN_ID);

    await expect(promise).rejects.toBeInstanceOf(StaleIdError);
    await expect(promise).rejects.toThrow(
      `No DevDigest PR with id ${UNKNOWN_ID}. Use owner/repo#123 instead.`,
    );
  });

  it('startReview throws StaleIdError keyed on prId for a known PR but an unknown agentId', async () => {
    const fake = new FakeDevDigestApi();
    fake.repos = [{ id: 'repo-1', full_name: 'acme/repo' }];
    fake.pulls = { 'repo-1': [{ id: 'pr-1', number: 1, title: 'Add x' }] };
    const promise = fake.startReview('pr-1', UNKNOWN_ID);

    await expect(promise).rejects.toBeInstanceOf(StaleIdError);
    await expect(promise).rejects.toThrow('No DevDigest PR with id pr-1. Use owner/repo#123 instead.');
  });

  it('listRuns throws StaleIdError with the E10 text for an unknown prId', async () => {
    const fake = new FakeDevDigestApi();
    const promise = fake.listRuns(UNKNOWN_ID);

    await expect(promise).rejects.toBeInstanceOf(StaleIdError);
    await expect(promise).rejects.toThrow(
      `No DevDigest PR with id ${UNKNOWN_ID}. Use owner/repo#123 instead.`,
    );
  });

  it('listReviews throws StaleIdError with the E10 text for an unknown prId', async () => {
    const fake = new FakeDevDigestApi();
    const promise = fake.listReviews(UNKNOWN_ID);

    await expect(promise).rejects.toBeInstanceOf(StaleIdError);
    await expect(promise).rejects.toThrow(
      `No DevDigest PR with id ${UNKNOWN_ID}. Use owner/repo#123 instead.`,
    );
  });

  it('listPulls throws StaleRepoIdError with the id-only text for an unknown repoId', async () => {
    const fake = new FakeDevDigestApi();
    const promise = fake.listPulls(UNKNOWN_ID);

    await expect(promise).rejects.toBeInstanceOf(StaleRepoIdError);
    await expect(promise).rejects.toThrow(`No DevDigest repo with id ${UNKNOWN_ID}. Use owner/repo instead.`);
  });

  it('listConventions throws StaleRepoIdError with the id-only text for an unknown repoId', async () => {
    const fake = new FakeDevDigestApi();
    const promise = fake.listConventions(UNKNOWN_ID);

    await expect(promise).rejects.toBeInstanceOf(StaleRepoIdError);
    await expect(promise).rejects.toThrow(`No DevDigest repo with id ${UNKNOWN_ID}. Use owner/repo instead.`);
  });

  it('getPull throws NotFoundError for an unknown prId', async () => {
    const fake = new FakeDevDigestApi();
    const promise = fake.getPull(UNKNOWN_ID);

    await expect(promise).rejects.toBeInstanceOf(NotFoundError);
  });

  it('script() still overrides the unscripted default with a scripted value', async () => {
    const fake = new FakeDevDigestApi();
    fake.script('startReview', {
      value: { run_id: 'run-1', agent_id: UNKNOWN_ID, agent_name: 'Whatever' },
    });

    await expect(fake.startReview(UNKNOWN_ID, UNKNOWN_ID)).resolves.toEqual({
      run_id: 'run-1',
      agent_id: UNKNOWN_ID,
      agent_name: 'Whatever',
    });
  });

  it('script() still overrides the unscripted default with a scripted error', async () => {
    const fake = new FakeDevDigestApi();
    fake.script('listRuns', { error: new Error('scripted boom') });

    await expect(fake.listRuns(UNKNOWN_ID)).rejects.toThrow('scripted boom');
  });
});
