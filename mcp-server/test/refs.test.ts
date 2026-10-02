import { describe, expect, it } from 'vitest';
import { DevDigestError } from '../src/core/errors.ts';
import { renderError } from '../src/format/text.ts';
import { isUuid, parsePrRef, parseRepoRef } from '../src/usecases/refs.ts';
import { PR_ID, REPO_ID } from './fakes.ts';

const expectedRef = { kind: 'ref', owner: 'acme', name: 'payments-api', number: 482 };

describe('parsePrRef', () => {
  it('parses owner/repo#N', () => {
    expect(parsePrRef('acme/payments-api#482')).toEqual(expectedRef);
  });

  it('parses a GitHub pull request URL', () => {
    expect(parsePrRef('https://github.com/acme/payments-api/pull/482')).toEqual(expectedRef);
  });

  it('treats a uuid as a DevDigest PR id', () => {
    expect(parsePrRef(PR_ID)).toEqual({ kind: 'id', prId: PR_ID });
  });

  it('trims surrounding whitespace', () => {
    expect(parsePrRef('  acme/payments-api#482 ')).toEqual(expectedRef);
  });

  it('accepts dots, dashes and underscores in owner and repo', () => {
    expect(parsePrRef('my_org.x/repo-1.y#3')).toEqual({
      kind: 'ref',
      owner: 'my_org.x',
      name: 'repo-1.y',
      number: 3,
    });
  });

  it.each(['482', 'acme/payments-api', 'acme#482', 'acme/pay ments#1', 'acme/payments-api#abc', ''])(
    'rejects %j with the format hint',
    (input) => {
      let caught: unknown;
      try {
        parsePrRef(input);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(DevDigestError);
      expect(renderError(caught, { baseUrl: 'http://x' })).toContain('owner/repo#123');
    },
  );
});

describe('parseRepoRef', () => {
  it('parses owner/repo', () => {
    expect(parseRepoRef('acme/payments-api')).toEqual({ kind: 'name', owner: 'acme', name: 'payments-api' });
  });

  it('treats a uuid as a repo id', () => {
    expect(parseRepoRef(REPO_ID)).toEqual({ kind: 'id', repoId: REPO_ID });
  });

  it('rejects a bare word', () => {
    expect(() => parseRepoRef('payments-api')).toThrow(DevDigestError);
  });
});

describe('isUuid', () => {
  it('recognises a uuid and nothing else', () => {
    expect(isUuid(PR_ID)).toBe(true);
    expect(isUuid('acme/payments-api#482')).toBe(false);
  });
});
