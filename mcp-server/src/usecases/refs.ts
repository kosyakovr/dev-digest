/**
 * Ring ②: parsing of the user-facing PR and repo references. Pure: no I/O.
 * Bad input throws `DevDigestError('bad_ref')`.
 */
import { DevDigestError } from '../core/errors.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME = '[A-Za-z0-9_.-]+';
const PR_SHORT = new RegExp(`^(${NAME})/(${NAME})#(\\d+)$`);
const PR_URL = new RegExp(`^https://github\\.com/(${NAME})/(${NAME})/pull/(\\d+)(?:[/?#].*)?$`, 'i');
const REPO_NAME = new RegExp(`^(${NAME})/(${NAME})$`);

export type PrRef =
  | { kind: 'id'; prId: string }
  | { kind: 'ref'; owner: string; name: string; number: number };

export type RepoRef =
  | { kind: 'id'; repoId: string }
  | { kind: 'name'; owner: string; name: string };

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export function parsePrRef(input: string): PrRef {
  const s = input.trim();
  if (isUuid(s)) return { kind: 'id', prId: s };
  const m = PR_SHORT.exec(s) ?? PR_URL.exec(s);
  if (m && m[1] && m[2] && m[3]) {
    const number = Number.parseInt(m[3], 10);
    if (Number.isSafeInteger(number) && number > 0) {
      return { kind: 'ref', owner: m[1], name: m[2], number };
    }
  }
  throw new DevDigestError('bad_ref');
}

export function parseRepoRef(input: string): RepoRef {
  const s = input.trim();
  if (isUuid(s)) return { kind: 'id', repoId: s };
  const m = REPO_NAME.exec(s);
  if (m && m[1] && m[2]) return { kind: 'name', owner: m[1], name: m[2] };
  throw new DevDigestError('bad_ref');
}
