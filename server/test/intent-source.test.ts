import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { IntentSource, IntentUnresolvedReason } from '@devdigest/shared';

/**
 * pr-self-review B-4: `IntentSource` is a discriminated union on `status`.
 * `used` never carries a reason; `unresolved` always carries one.
 */
describe('IntentSource (status-discriminated)', () => {
  it('accepts a used source with reason null', () => {
    expect(IntentSource.safeParse({ kind: 'title', ref: null, status: 'used', reason: null }).success).toBe(true);
    expect(IntentSource.safeParse({ kind: 'spec', ref: 'docs/x.md', status: 'used', reason: null }).success).toBe(true);
  });

  it('accepts an unresolved source with a reason', () => {
    expect(
      IntentSource.safeParse({ kind: 'ticket', ref: '#12', status: 'unresolved', reason: 'not_found' }).success,
    ).toBe(true);
  });

  it('rejects a used source that carries a reason', () => {
    expect(IntentSource.safeParse({ kind: 'title', ref: null, status: 'used', reason: 'not_found' }).success).toBe(false);
  });

  it('rejects an unresolved source with reason null', () => {
    expect(IntentSource.safeParse({ kind: 'ticket', ref: '#12', status: 'unresolved', reason: null }).success).toBe(false);
  });

  it('rejects an unknown status and an unknown reason', () => {
    expect(IntentSource.safeParse({ kind: 'title', ref: null, status: 'maybe', reason: null }).success).toBe(false);
    expect(IntentSource.safeParse({ kind: 'ticket', ref: '#1', status: 'unresolved', reason: 'nope' }).success).toBe(false);
  });

  it('every documented unresolved reason is accepted', () => {
    for (const reason of IntentUnresolvedReason.options) {
      expect(IntentSource.safeParse({ kind: 'link', ref: 'u', status: 'unresolved', reason }).success, reason).toBe(true);
    }
  });
});

describe('vendored contract copies', () => {
  it('review-api.ts is identical in server/ and client/ (they are changed together)', () => {
    const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
    expect(read('../../client/src/vendor/shared/contracts/review-api.ts')).toBe(
      read('../src/vendor/shared/contracts/review-api.ts'),
    );
  });
});
