import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import type {
  IntentConfidence,
  IntentSource,
  IntentUnresolvedReason,
  PrIntentRecord,
  RepoRef,
} from '@devdigest/shared';
import type { ReviewIntent } from '@devdigest/reviewer-core';
import type { PrIntentRow } from '../../db/rows.js';
import {
  MAX_INTENT_STATEMENT_CHARS,
  MAX_SCOPE_ITEMS,
  MAX_SCOPE_ITEM_CHARS,
  MIN_SUBSTANTIVE_BODY_CHARS,
  SPEC_EXTENSIONS,
} from './constants.js';
import type { IntentBundle } from './types.js';

/**
 * L03 — pure helpers (ring ②). No I/O, no `await`, no container. Everything
 * here is deterministic and unit-testable without Fastify or a database.
 */

// ---------------------------------------------------------------- text noise

const HTML_COMMENT = /<!--[\s\S]*?-->/g;
/** An ATX heading needs whitespace after the hashes: `#482 is …` is prose (server/INSIGHTS.md 2026-09-22 #2). */
const HEADING_LINE = /^#{1,6}\s+\S/;
const UNCHECKED_BOX_LINE = /^\s*[-*+]\s*\[ \]/;

export function stripHtmlComments(text: string): string {
  return text.replace(HTML_COMMENT, '');
}

/** The body minus HTML comments, heading-only lines and unchecked-checkbox lines (template boilerplate). */
export function stripBodyNoise(body: string): string {
  return stripHtmlComments(body)
    .split('\n')
    .filter((l) => !HEADING_LINE.test(l.trim()) && !UNCHECKED_BOX_LINE.test(l))
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n');
}

export function isSubstantiveBody(body: string | null | undefined): boolean {
  if (!body) return false;
  return stripBodyNoise(body).length >= MIN_SUBSTANTIVE_BODY_CHARS;
}

export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

// -------------------------------------------------------------- ticket refs

export interface TicketRef {
  number: number;
  via: 'keyword' | 'url' | 'mention';
}

const sameRepo = (owner: string, name: string, repo: RepoRef): boolean =>
  owner.toLowerCase() === repo.owner.toLowerCase() && name.toLowerCase() === repo.name.toLowerCase();

const crossRepoTicket = (ref: string): IntentSource => ({
  kind: 'ticket',
  ref,
  status: 'unresolved',
  reason: 'cross_repo',
});

/**
 * Issue references in priority order: (1) a closing keyword, (2) a same-repo
 * issue URL, (3) a bare `#N` — only when (1) and (2) found nothing. References
 * into another repository come back as `cross_repo` unresolved entries.
 */
export function extractTicketRefs(
  text: string,
  repo: RepoRef,
): { refs: TicketRef[]; unresolved: IntentSource[] } {
  const refs: TicketRef[] = [];
  const unresolved: IntentSource[] = [];
  const seen = new Set<number>();
  const seenCross = new Set<string>();
  const add = (number: number, via: TicketRef['via']) => {
    if (seen.has(number)) return;
    seen.add(number);
    refs.push({ number, via });
  };
  const addCross = (ref: string) => {
    if (seenCross.has(ref)) return;
    seenCross.add(ref);
    unresolved.push(crossRepoTicket(ref));
  };

  const keyword = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+(?:([\w.-]+)\/([\w.-]+))?#(\d+)\b/gi;
  for (const m of text.matchAll(keyword)) {
    const [, owner, name, n] = m;
    if (n === undefined) continue;
    if (owner && name && !sameRepo(owner, name, repo)) addCross(`${owner}/${name}#${n}`);
    else add(Number(n), 'keyword');
  }

  const url = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)/gi;
  for (const m of text.matchAll(url)) {
    const [, owner, name, n] = m;
    if (!owner || !name || n === undefined) continue;
    if (sameRepo(owner, name, repo)) add(Number(n), 'url');
    else addCross(`${owner}/${name}#${n}`);
  }

  if (refs.length === 0) {
    // `(?<![\w/&])` skips `owner/repo#3` and HTML entities such as `&#39;`.
    for (const m of text.matchAll(/(?<![\w/&])#(\d+)\b/g)) {
      if (m[1] !== undefined) add(Number(m[1]), 'mention');
    }
  }
  return { refs, unresolved };
}

// --------------------------------------------------------------- spec refs

/** Normalise a link/path to a repo-relative path, or say why it is refused. Runs before any read. */
export function canonicalizeRepoPath(raw: string): string | { reason: IntentUnresolvedReason } {
  let p = raw.replace(/[#?].*$/s, '');
  try {
    p = decodeURIComponent(p);
  } catch {
    return { reason: 'outside_repo' };
  }
  if (p.includes('\0') || p.includes('\\')) return { reason: 'outside_repo' };
  p = p.replace(/^(?:\.\/|\/)+/, '');
  if (p === '') return { reason: 'outside_repo' };
  p = posix.normalize(p);
  if (p === '..' || p.startsWith('../') || p.startsWith('/') || p.startsWith('-')) {
    return { reason: 'outside_repo' };
  }
  if (p.split('/').includes('.git')) return { reason: 'outside_repo' };
  const lower = p.toLowerCase();
  if (!SPEC_EXTENSIONS.some((ext) => lower.endsWith(ext))) return { reason: 'unsupported_type' };
  return p;
}

const URL_RE = /https?:\/\/[^\s<>()[\]"'`]+/gi;
const EXT_ALT = SPEC_EXTENSIONS.map((e) => e.slice(1)).join('|');
const REL_PATH_RE = new RegExp(
  `(?:^|[\\s(\\[\`"'<])((?:\\/|\\.{1,2}\\/)?[\\w@.%+-]+(?:\\/[\\w@.%+-]+)*\\.(?:${EXT_ALT}))(?:#[\\w%-]*)?(?=$|[\\s)\\]\`"'>,;:!?])`,
  'gi',
);

const trimUrl = (u: string): string => u.replace(/[.,;:!?]+$/, '');
const unresolvedLink = (ref: string, reason: IntentUnresolvedReason): IntentSource => ({
  kind: 'link',
  ref: ref.slice(0, 300),
  status: 'unresolved',
  reason,
});

/**
 * Spec / plan candidates in free text: same-repo GitHub blob URLs (the URL's
 * ref is ignored — the file is read at the PR head) and repo-relative document
 * paths. Every other URL is recorded as an unresolved link and never fetched.
 * Same-repo/cross-repo issue URLs belong to `extractTicketRefs` and are skipped.
 */
export function extractSpecRefs(
  text: string,
  repo: RepoRef,
): { paths: string[]; unresolved: IntentSource[] } {
  const paths: string[] = [];
  const unresolved: IntentSource[] = [];
  const seenPath = new Set<string>();
  const seenUnresolved = new Set<string>();
  const addPath = (p: string) => {
    if (seenPath.has(p)) return;
    seenPath.add(p);
    paths.push(p);
  };
  const addUnresolved = (s: IntentSource) => {
    const key = `${s.kind}|${s.ref}|${s.reason}`;
    if (seenUnresolved.has(key)) return;
    seenUnresolved.add(key);
    unresolved.push(s);
  };

  for (const m of text.matchAll(URL_RE)) {
    const url = trimUrl(m[0]);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      addUnresolved(unresolvedLink(url, 'external_not_fetched'));
      continue;
    }
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol === 'https:' && (host === 'github.com' || host === 'www.github.com')) {
      const seg = parsed.pathname.split('/').filter(Boolean);
      const [owner, name, kind, , ...rest] = seg;
      if (owner && name) {
        if (kind === 'issues' && /^\d+$/.test(seg[3] ?? '')) continue; // a ticket reference
        if (!sameRepo(owner, name, repo)) {
          addUnresolved(unresolvedLink(url, 'cross_repo'));
          continue;
        }
        if (kind === 'blob' && rest.length > 0) {
          const canon = canonicalizeRepoPath(rest.join('/'));
          if (typeof canon === 'string') addPath(canon);
          else addUnresolved(unresolvedLink(url, canon.reason));
          continue;
        }
      }
    }
    addUnresolved(unresolvedLink(url, 'external_not_fetched'));
  }

  const withoutUrls = text.replace(URL_RE, ' ');
  for (const m of withoutUrls.matchAll(REL_PATH_RE)) {
    const raw = m[1];
    if (!raw) continue;
    const canon = canonicalizeRepoPath(raw);
    if (typeof canon === 'string') addPath(canon);
    else addUnresolved({ kind: 'spec', ref: raw.slice(0, 300), status: 'unresolved', reason: canon.reason });
  }
  return { paths, unresolved };
}

// -------------------------------------------------------------- confidence

const LEVELS: IntentConfidence[] = ['low', 'medium', 'high'];
const lower = (c: IntentConfidence): IntentConfidence => LEVELS[Math.max(0, LEVELS.indexOf(c) - 1)] ?? 'low';

/**
 * Confidence from the sources actually found. high = ticket AND spec; medium =
 * any one of ticket / spec / substantive body; else low. The model can only
 * LOWER it: `conflict` (sources disagree with the diff) and `specIgnored` (a
 * spec was supplied but the classifier cited none of it) each cost one step,
 * never below low. No model number is read or stored.
 */
export function computeConfidence(i: {
  ticket?: boolean;
  spec?: boolean;
  substantiveBody?: boolean;
  conflict?: boolean;
  specIgnored?: boolean;
}): IntentConfidence {
  let c: IntentConfidence = i.ticket && i.spec ? 'high' : i.ticket || i.spec || i.substantiveBody ? 'medium' : 'low';
  if (i.conflict) c = lower(c);
  if (i.specIgnored) c = lower(c);
  return c;
}

// ----------------------------------------------------------- classification

export interface ClampedClassification {
  /** false when the statement is empty after trimming — treat as a failure. */
  valid: boolean;
  intent: string;
  inScope: string[];
  outOfScope: string[];
  sourcesConflict: boolean;
  evidenceCount: number;
  /** true when at least one evidence entry cites the `spec` source. */
  citedSpec: boolean;
}

function clampList(items: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const item = raw.trim().slice(0, MAX_SCOPE_ITEM_CHARS).trim();
    const key = item.toLowerCase();
    if (item === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length === MAX_SCOPE_ITEMS) break;
  }
  return out;
}

/** Truncate the model's answer in code (the schema carries no `.max()`: a violated one costs a paid reprompt). */
export function clampClassification(raw: {
  evidence: { source: string; quote: string }[];
  intent: string;
  in_scope: string[];
  out_of_scope: string[];
  sources_conflict: boolean;
}): ClampedClassification {
  const intent = raw.intent.trim().slice(0, MAX_INTENT_STATEMENT_CHARS).trim();
  return {
    valid: intent.length > 0,
    intent,
    inScope: clampList(raw.in_scope),
    outOfScope: clampList(raw.out_of_scope),
    sourcesConflict: raw.sources_conflict,
    evidenceCount: raw.evidence.length,
    citedSpec: raw.evidence.some((e) => e.source === 'spec'),
  };
}

// --------------------------------------------------------------- hash + DTO

/**
 * sha256 over what determines the answer. The diff and file list are left out:
 * `headSha` pins them, so the review path and the manual path hash the same.
 */
export function inputHash(i: {
  promptVersion: string;
  provider: string;
  model: string;
  headSha: string;
  bundle: IntentBundle;
}): string {
  const { bundle: b } = i;
  const payload = {
    promptVersion: i.promptVersion,
    provider: i.provider,
    model: i.model,
    headSha: i.headSha,
    title: b.title,
    body: b.body,
    branch: b.branch,
    commits: b.commits,
    tickets: b.tickets,
    specs: b.specs,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/** Row → wire DTO, field by field. `stale` = the PR head moved since derivation. */
export function toPrIntentDto(row: PrIntentRow, pullHeadSha: string): PrIntentRecord {
  return {
    pr_id: row.prId,
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    confidence: row.confidence,
    sources: row.sources,
    head_sha: row.headSha,
    stale: row.headSha !== pullHeadSha,
    provider: row.provider,
    model: row.model,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
    derived_at: row.derivedAt.toISOString(),
  };
}

/** Row → the prompt-side intent handed to every agent of a review batch. */
export function toReviewIntent(row: PrIntentRow): ReviewIntent {
  return {
    statement: row.intent,
    inScope: row.inScope,
    outOfScope: row.outOfScope,
    confidence: row.confidence,
  };
}
