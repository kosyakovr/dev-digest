/**
 * Ring ②: builds the `ReviewView` shown by both `run_agent_on_pr` and
 * `get_findings`: hides dismissed findings (counting them), filters by minimum
 * severity, sorts and pages. Pure: no I/O.
 */
import type { Finding, Review, RunSummary } from '../core/schemas.ts';
import type { ReviewView, RunStatus, Severity } from '../core/views.ts';

const ORDER: Severity[] = ['CRITICAL', 'WARNING', 'SUGGESTION'];

/** Unknown severities rank with SUGGESTION. */
export function severityRank(severity: string): number {
  const i = ORDER.indexOf(severity.toUpperCase() as Severity);
  return i === -1 ? ORDER.length - 1 : i;
}

export function normalizeStatus(status: string | null | undefined): RunStatus {
  return status === 'done' || status === 'failed' || status === 'cancelled' ? status : 'running';
}

export interface ReviewViewArgs {
  prLabel: string;
  runId: string | null;
  status: RunStatus;
  attached?: boolean;
  agentName?: string | null;
  run?: RunSummary | undefined;
  review?: Review | undefined;
  minSeverity: Severity;
  limit: number;
  offset: number;
  note?: string | null;
}

function compareFindings(a: Finding, b: Finding): number {
  return (
    severityRank(a.severity) - severityRank(b.severity) ||
    (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) ||
    a.start_line - b.start_line
  );
}

export function buildReviewView(args: ReviewViewArgs): ReviewView {
  const all = args.review?.findings ?? [];
  const live = all.filter((f) => !f.dismissed_at);
  const visible = live
    .filter((f) => severityRank(f.severity) <= severityRank(args.minSeverity))
    .sort(compareFindings);
  const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of visible) counts[ORDER[severityRank(f.severity)] ?? 'SUGGESTION'] += 1;
  return {
    prLabel: args.prLabel,
    runId: args.runId,
    status: args.status,
    attached: args.attached ?? false,
    agentName: args.agentName ?? args.review?.agent_name ?? args.run?.agent_name ?? null,
    verdict: args.review?.verdict ?? null,
    score: args.review?.score ?? args.run?.score ?? null,
    durationMs: args.run?.duration_ms ?? null,
    costUsd: args.run?.cost_usd ?? null,
    summary: args.review?.summary ?? null,
    error: args.run?.error ?? null,
    counts,
    findings: visible.slice(args.offset, args.offset + args.limit),
    total: visible.length,
    offset: args.offset,
    dismissedHidden: all.length - live.length,
    note: args.note ?? null,
  };
}
