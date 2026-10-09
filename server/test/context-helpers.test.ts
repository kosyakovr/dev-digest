import { describe, it, expect } from 'vitest';
import {
  classifyRead,
  isDocPath,
  isValidAttachmentPath,
  normalizeItems,
  runOrder,
  sortForResponse,
  sourceOf,
} from '../src/modules/context/helpers.js';

/**
 * L05 project-context pure helpers. Expected values come from the plan's Test
 * brief (WP5.tests) and spec rules A-5, A-19, A-21, A-27 — not from the code.
 */
const DEFAULTS = ['docs', 'specs'];

describe('sourceOf — the configured folder nearest the repo root (AC-52)', () => {
  it('picks the first matching directory from the left', () => {
    expect(sourceOf('docs/specs/x.md', DEFAULTS)).toBe('docs');
    expect(sourceOf('specs/docs/x.md', DEFAULTS)).toBe('specs');
  });

  it('finds a folder at any depth', () => {
    expect(sourceOf('a/docs/y.md', DEFAULTS)).toBe('docs');
  });

  it('is null when no directory segment is a configured folder', () => {
    expect(sourceOf('src/z.md', DEFAULTS)).toBeNull();
    expect(sourceOf('README.md', DEFAULTS)).toBeNull();
  });

  it('does not take the file name for a folder', () => {
    expect(sourceOf('docs', DEFAULTS)).toBeNull();
    expect(sourceOf('src/docs', DEFAULTS)).toBeNull();
  });
});

describe('isDocPath — a lowercase .md under a configured folder (AC-3, AC-55)', () => {
  it('accepts a doc at any depth', () => {
    expect(isDocPath('docs/a.md', DEFAULTS)).toBe(true);
    expect(isDocPath('x/specs/deep/b.md', DEFAULTS)).toBe(true);
  });

  it('rejects a file outside the folders, a folder-named file, and another extension or case', () => {
    expect(isDocPath('src/z.md', DEFAULTS)).toBe(false);
    expect(isDocPath('docs.md', DEFAULTS)).toBe(false);
    expect(isDocPath('docs/A.MD', DEFAULTS)).toBe(false);
    expect(isDocPath('docs/img.png', DEFAULTS)).toBe(false);
    expect(isDocPath('docs/a.markdown', DEFAULTS)).toBe(false);
  });

  it('follows the configured names: adr and rfc, not docs', () => {
    const folders = ['adr', 'rfc'];
    expect(isDocPath('x/adr/1.md', folders)).toBe(true);
    expect(isDocPath('rfc/2.md', folders)).toBe(true);
    expect(isDocPath('docs/3.md', folders)).toBe(false);
  });

  it('is case-sensitive on the folder name too', () => {
    expect(isDocPath('Docs/a.md', DEFAULTS)).toBe(false);
  });
});

describe('isValidAttachmentPath (AC-21)', () => {
  it('accepts a repo-relative markdown path', () => {
    expect(isValidAttachmentPath('specs/a.md')).toBe(true);
    expect(isValidAttachmentPath('README.md')).toBe(true);
  });

  it.each(['/etc/a.md', 'a/../b.md', '../b.md', 'a.txt', '-x.md', '', 'docs/a.MD'])(
    'rejects %j',
    (p) => {
      expect(isValidAttachmentPath(p)).toBe(false);
    },
  );
});

describe('normalizeItems (AC-22, AC-60, AC-61)', () => {
  it('renumbers positions with gaps to 0..n-1, keeping their order', () => {
    expect(
      normalizeItems([
        { path: 'a', position: 2 },
        { path: 'b', position: 7 },
      ]),
    ).toEqual({
      items: [
        { path: 'a', position: 0 },
        { path: 'b', position: 1 },
      ],
    });
  });

  it('renumbers by position value, not by input order', () => {
    const n = normalizeItems([
      { path: 'a', position: 9 },
      { path: 'b', position: 3 },
    ]);
    expect(n).toEqual({
      items: [
        { path: 'a', position: 1 },
        { path: 'b', position: 0 },
      ],
    });
  });

  it('rejects two different paths at the same position', () => {
    expect(
      normalizeItems([
        { path: 'a', position: 0 },
        { path: 'b', position: 0 },
      ]),
    ).toEqual({ error: 'duplicate_position' });
  });

  it('collapses a repeated path first (the first wins), so [a:0, a:0] is one item', () => {
    expect(
      normalizeItems([
        { path: 'a', position: 0 },
        { path: 'a', position: 0 },
      ]),
    ).toEqual({ items: [{ path: 'a', position: 0 }] });
    expect(
      normalizeItems([
        { path: 'a', position: null },
        { path: 'b', position: 0 },
        { path: 'a', position: 1 },
      ]),
    ).toEqual({
      items: [
        { path: 'a', position: null },
        { path: 'b', position: 0 },
      ],
    });
  });

  it('leaves null positions null and allows many of them', () => {
    expect(
      normalizeItems([
        { path: 'a', position: null },
        { path: 'b', position: null },
      ]),
    ).toEqual({
      items: [
        { path: 'a', position: null },
        { path: 'b', position: null },
      ],
    });
  });
});

describe('sortForResponse (A-27)', () => {
  it('lists the positioned first by position, then the unpositioned by path', () => {
    expect(
      sortForResponse([
        { path: 'z.md', position: null },
        { path: 'b.md', position: 1 },
        { path: 'a.md', position: null },
        { path: 'c.md', position: 0 },
      ]),
    ).toEqual([
      { path: 'c.md', position: 0 },
      { path: 'b.md', position: 1 },
      { path: 'a.md', position: null },
      { path: 'z.md', position: null },
    ]);
  });
});

describe('runOrder — the order docs enter the prompt (A-5)', () => {
  it('positioned first, then unpositioned by source name then path, then those with no source', () => {
    const out = runOrder(
      [
        { path: 'specs/x.md', position: 0 },
        { path: 'specs/b.md', position: null },
        { path: 'docs/z.md', position: null },
        { path: 'README.md', position: null },
      ],
      DEFAULTS,
    );
    expect(out.map((i) => i.path)).toEqual(['specs/x.md', 'docs/z.md', 'specs/b.md', 'README.md']);
  });

  it('orders the unpositioned of one source by path', () => {
    const out = runOrder(
      [
        { path: 'docs/b.md', position: null },
        { path: 'docs/a.md', position: null },
      ],
      DEFAULTS,
    );
    expect(out.map((i) => i.path)).toEqual(['docs/a.md', 'docs/b.md']);
  });

  it('puts a doc whose folder is no longer configured after every sourced doc, by path', () => {
    const out = runOrder(
      [
        { path: 'old/z.md', position: null },
        { path: 'old/a.md', position: null },
        { path: 'specs/s.md', position: null },
      ],
      DEFAULTS,
    );
    expect(out.map((i) => i.path)).toEqual(['specs/s.md', 'old/a.md', 'old/z.md']);
  });
});

describe('classifyRead (AC-32, R-25)', () => {
  it('a missing blob is not_found', () => {
    expect(classifyRead(null, 200_000)).toBe('not_found');
  });

  it('a blob over the cap is too_large, and exactly the cap is fine', () => {
    expect(classifyRead({ text: '', bytes: 200_001 }, 200_000)).toBe('too_large');
    expect(classifyRead({ text: 'a'.repeat(200_000), bytes: 200_000 }, 200_000)).toBe('ok');
  });

  it('text whose UTF-8 length differs from the blob size is unreadable', () => {
    expect(classifyRead({ text: '�', bytes: 1 }, 200_000)).toBe('unreadable');
  });

  it('a normal doc, multi-byte text included, is ok', () => {
    expect(classifyRead({ text: '# A', bytes: 3 }, 200_000)).toBe('ok');
    expect(classifyRead({ text: 'é', bytes: 2 }, 200_000)).toBe('ok');
  });
});
