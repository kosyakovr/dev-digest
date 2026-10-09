import {
  PrBrief,
  type BlastRadius,
  type Intent,
  type PrHistory,
  type PrIntentRecord,
  type Risk,
  type PrBriefResponse,
  type ReviewFocusItem,
  type SmartDiffRole,
} from '@devdigest/shared';
import {
  DIFF_ROLE_ORDER,
  MAX_DOCS,
  MAX_DOC_CHARS,
  MAX_DOCS_TOTAL_CHARS,
  MAX_EXPLANATION_CHARS,
  MAX_FACTS_CHARS,
  MAX_FILE_REFS,
  MAX_FOCUS,
  MAX_HISTORY_ITEMS,
  MAX_LIST_CHARS,
  MAX_LIST_PATHS,
  MAX_REASON_CHARS,
  MAX_RISKS,
  MAX_SUMMARY_CHARS,
  MAX_TITLE_CHARS,
} from './constants.js';
import type { BriefAnswer, BriefPayload } from './prompt.js';

/**
 * L05 risk brief — pure functions only (ring ②): no I/O, no DB, no ports, no
 * `await`. Grounding, clamping and prompt-fact assembly.
 */

/** A changed file as the brief sees it. */
export interface BriefFile {
  path: string;
  role: SmartDiffRole;
  additions: number;
  deletions: number;
  patch: string | null;
}

// ---- Diff hunks --------------------------------------------------------

const HUNK_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * New-side line ranges `[from, to]` of every hunk in a stored patch. `+c,d`
 * covers `[c, c+d-1]`; `d` is 1 when omitted; `d = 0` is an empty range.
 */
export function newSideRanges(patch: string | null | undefined): [number, number][] {
  if (!patch) return [];
  const ranges: [number, number][] = [];
  for (const line of patch.split('\n')) {
    const m = HUNK_RE.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count > 0) ranges.push([start, start + count - 1]);
  }
  return ranges;
}

// ---- Grounding ---------------------------------------------------------

export interface GroundedFocus {
  kept: ReviewFocusItem[];
  dropped: number;
}

/**
 * Keep a focus item only when its file is changed, has a patch, and the line
 * lies on the new side of one of its hunks; then drop a repeated `file:line`
 * (the first one wins). Model order is kept.
 */
export function groundFocus(
  items: { file: string; line: number; reason: string }[],
  files: { path: string; patch: string | null }[],
): GroundedFocus {
  const rangesByPath = new Map<string, [number, number][]>();
  for (const f of files) rangesByPath.set(f.path, newSideRanges(f.patch));
  const seen = new Set<string>();
  const kept: ReviewFocusItem[] = [];
  let dropped = 0;
  for (const item of items) {
    const ranges = rangesByPath.get(item.file);
    const onNewSide =
      Number.isInteger(item.line) &&
      item.line >= 1 &&
      !!ranges?.some(([from, to]) => item.line >= from && item.line <= to);
    const key = `${item.file}:${item.line}`;
    if (!onNewSide || seen.has(key)) {
      dropped++;
      continue;
    }
    seen.add(key);
    kept.push({ file: item.file, line: item.line, reason: item.reason });
  }
  return { kept, dropped };
}

const LINE_SUFFIX_RE = /:\d+(?:-\d+)?$/;

/**
 * Strip a `:n` / `:n-m` suffix from each ref, keep only changed paths, each
 * once. A risk whose list ends empty is kept.
 */
export function groundRisks(
  risks: BriefAnswer['risks'],
  changedPaths: Iterable<string>,
): { kept: Risk[]; droppedRefs: number } {
  const changed = new Set(changedPaths);
  let droppedRefs = 0;
  const kept = risks.map((r) => {
    const refs: string[] = [];
    for (const raw of r.file_refs) {
      const path = raw.replace(LINE_SUFFIX_RE, '');
      if (!changed.has(path) || refs.includes(path)) {
        droppedRefs++;
        continue;
      }
      refs.push(path);
    }
    return { ...r, file_refs: refs };
  });
  return { kept, droppedRefs };
}

// ---- Clamp -------------------------------------------------------------

export interface ClampedAnswer {
  summary: string;
  risks: Risk[];
  review_focus: ReviewFocusItem[];
  /** true when the summary is empty after trimming: the caller reports it (502). */
  emptySummary: boolean;
}

const cut = (s: string, max: number): string => s.slice(0, max);

/** Apply A-9's limits in the model's order. Takes the already grounded lists. */
export function clampAnswer(a: {
  summary: string;
  risks: Risk[];
  review_focus: ReviewFocusItem[];
}): ClampedAnswer {
  const summary = cut(a.summary.trim(), MAX_SUMMARY_CHARS);
  return {
    summary,
    emptySummary: summary.length === 0,
    risks: a.risks.slice(0, MAX_RISKS).map((r) => ({
      kind: r.kind,
      title: cut(r.title, MAX_TITLE_CHARS),
      explanation: cut(r.explanation, MAX_EXPLANATION_CHARS),
      severity: r.severity,
      file_refs: r.file_refs.slice(0, MAX_FILE_REFS),
    })),
    review_focus: a.review_focus
      .slice(0, MAX_FOCUS)
      .map((f) => ({ file: f.file, line: f.line, reason: cut(f.reason, MAX_REASON_CHARS) })),
  };
}

// ---- Prompt facts ------------------------------------------------------

/** First paths of a list while count ≤ 100 and the summed path length ≤ 4,000. */
function capPaths(paths: string[]): string[] {
  const out: string[] = [];
  let chars = 0;
  for (const p of paths) {
    if (out.length >= MAX_LIST_PATHS || chars + p.length > MAX_LIST_CHARS) break;
    out.push(p);
    chars += p.length;
  }
  return out;
}

function capFiles(files: BriefFile[]): BriefPayload['files'] {
  const out: BriefPayload['files'] = [];
  let chars = 0;
  for (const f of files) {
    if (out.length >= MAX_LIST_PATHS || chars + f.path.length > MAX_LIST_CHARS) break;
    out.push({ path: f.path, role: f.role, additions: f.additions, deletions: f.deletions });
    chars += f.path.length;
  }
  return out;
}

function callerFiles(blast: BlastRadius): string[] {
  const seen = new Set<string>();
  for (const d of blast.downstream) for (const c of d.callers) seen.add(c.file);
  return capPaths([...seen]);
}

function sizeOf(payload: BriefPayload): number {
  return JSON.stringify(payload).length;
}

/**
 * Shrink `patch` until the payload with it appended fits `MAX_FACTS_CHARS`.
 * Returns the longest prefix that fits, or null when not even an empty patch does.
 */
function fitLastPatch(base: BriefPayload, path: string, patch: string): string | null {
  const fits = (n: number) =>
    sizeOf({ ...base, diff: [...(base.diff ?? []), { path, patch: patch.slice(0, n) }] }) <= MAX_FACTS_CHARS;
  if (!fits(0)) return null;
  let lo = 0;
  let hi = patch.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return patch.slice(0, lo);
}

/**
 * Everything the model is shown. Blast, history and docs are measured first;
 * the diff fills what is left of `MAX_FACTS_CHARS`, in role order, with
 * boilerplate left out and the last patch truncated. `specsRead` lists the doc
 * paths whose text went in.
 */
export function buildBriefFacts(a: {
  intent: Intent;
  files: BriefFile[];
  blast: BlastRadius;
  history: PrHistory;
  docs: { source: string; text: string }[];
}): { payload: BriefPayload; specsRead: string[] } {
  const docs: { path: string; text: string }[] = [];
  let docChars = 0;
  for (const d of a.docs) {
    if (docs.length >= MAX_DOCS || docChars >= MAX_DOCS_TOTAL_CHARS) break;
    const text = d.text.slice(0, Math.min(MAX_DOC_CHARS, MAX_DOCS_TOTAL_CHARS - docChars));
    docs.push({ path: d.source, text });
    docChars += text.length;
  }

  const payload: BriefPayload = {
    intent: {
      intent: a.intent.intent,
      in_scope: a.intent.in_scope,
      out_of_scope: a.intent.out_of_scope,
    },
    files: capFiles(a.files),
    blast: {
      summary: a.blast.summary,
      caller_files: callerFiles(a.blast),
      incomplete: a.blast.degraded === true,
      ...(a.blast.reason ? { reason: a.blast.reason } : {}),
    },
    history: {
      items: a.history.history.slice(0, MAX_HISTORY_ITEMS).map((h) => ({
        pr_number: h.pr_number,
        title: h.title,
        merged_at: h.merged_at,
        files_overlap: capPaths(h.files_overlap),
        notes: h.notes,
      })),
      incomplete: a.history.degraded === true,
      ...(a.history.reason ? { reason: a.history.reason } : {}),
    },
    ...(docs.length > 0 ? { docs } : {}),
  };

  for (const role of DIFF_ROLE_ORDER) {
    for (const f of a.files) {
      if (f.role !== role || !f.patch) continue;
      const entry = { path: f.path, patch: f.patch };
      const withEntry: BriefPayload = { ...payload, diff: [...(payload.diff ?? []), entry] };
      if (sizeOf(withEntry) <= MAX_FACTS_CHARS) {
        payload.diff = withEntry.diff;
        continue;
      }
      const fitted = fitLastPatch(payload, f.path, f.patch);
      if (fitted !== null && fitted.length > 0) {
        payload.diff = [...(payload.diff ?? []), { path: f.path, patch: fitted }];
      }
      return { payload, specsRead: docs.map((d) => d.path) };
    }
  }
  return { payload, specsRead: docs.map((d) => d.path) };
}

// ---- Stored shape ------------------------------------------------------

export function toIntent(record: PrIntentRecord): Intent {
  return { intent: record.intent, in_scope: record.in_scope, out_of_scope: record.out_of_scope };
}

/** The stored jsonb → a brief, or null when it no longer parses. */
export function parseStoredBrief(json: unknown): PrBrief | null {
  const parsed = PrBrief.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** `stale` = the PR head moved since the brief was generated; false with no brief. */
export function toBriefResponse(
  brief: PrBrief | null,
  pullHeadSha: string,
  generating: boolean,
): PrBriefResponse {
  return {
    brief,
    generating,
    stale: brief ? brief.generation.head_sha !== pullHeadSha : false,
  };
}
