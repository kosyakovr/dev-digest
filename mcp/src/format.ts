/**
 * Use case (ring ②) — pure formatting, sorting and paging helpers shared by
 * every tool. No I/O: only ① types and values in, plain objects out. Must
 * not import the SDK, `fetch`, the environment, `api/`, `tools/`,
 * `server.ts`, `index.ts`, `config.ts` or `log.ts`.
 */
import type {
  AgentOutput,
  AgentWire,
  ConventionOutput,
  ConventionWire,
  FindingWire,
  GetFindingsFindingOutput,
  GetFindingsReviewOutput,
  ReviewWire,
} from './contracts.js';
import { invalidCursor } from './errors.js';

export type ResponseFormat = 'concise' | 'detailed';

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/** Unknown severities sort last (Contract § Common output). */
export function severityRank(severity: string): number {
  return SEVERITY_ORDER[severity] ?? 3;
}

export function loc(file: string, startLine: number, endLine: number): string {
  return startLine === endLine ? `${file}:${startLine}` : `${file}:${startLine}-${endLine}`;
}

export interface FindingLike {
  severity: string;
  file: string;
  start_line: number;
}

/** CRITICAL > WARNING > SUGGESTION (unknown last), then file asc, then start_line asc. */
export function sortFindings<T extends FindingLike>(findings: T[]): T[] {
  return [...findings].sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    return a.start_line - b.start_line;
  });
}

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): number {
  if (!BASE64URL_RE.test(cursor)) throw invalidCursor(cursor);
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const n = Number(decoded);
  if (!Number.isInteger(n) || n < 0 || String(n) !== decoded) throw invalidCursor(cursor);
  return n;
}

/** CRITICAL → only CRITICAL; WARNING → CRITICAL+WARNING; none/SUGGESTION → all. */
export function minSeverityFilter(min?: string): (severity: string) => boolean {
  if (min === 'CRITICAL') return (s) => s === 'CRITICAL';
  if (min === 'WARNING') return (s) => s === 'CRITICAL' || s === 'WARNING';
  return () => true;
}

export function projectAgent(agent: AgentWire, format: ResponseFormat): AgentOutput {
  const base: AgentOutput = { id: agent.id, name: agent.name, enabled: agent.enabled, model: agent.model };
  if (format === 'concise') return base;
  const detailed: AgentOutput = { ...base };
  if (agent.description !== undefined) detailed.description = agent.description;
  if (agent.provider !== undefined) detailed.provider = agent.provider;
  if (agent.strategy !== undefined) detailed.strategy = agent.strategy;
  if (agent.version !== undefined) detailed.version = agent.version;
  return detailed;
}

/** Used by `devdigest_get_findings` — the finding shape carries `agent_name`
 * (the review it came from may not be the caller's own). */
export function projectFinding(
  f: FindingWire,
  format: ResponseFormat,
  ctx: { agentName: string | null; runId: string | null },
): GetFindingsFindingOutput {
  const base: GetFindingsFindingOutput = {
    severity: f.severity,
    title: f.title,
    loc: loc(f.file, f.start_line, f.end_line),
    agent_name: ctx.agentName,
  };
  if (format === 'concise') return base;
  return {
    ...base,
    id: f.id,
    category: f.category,
    rationale: f.rationale,
    suggestion: f.suggestion ?? null,
    confidence: f.confidence,
    kind: f.kind ?? null,
    run_id: ctx.runId,
  };
}

export function projectReview(
  review: ReviewWire,
  format: ResponseFormat,
  findingsCount: number,
): GetFindingsReviewOutput {
  const base: GetFindingsReviewOutput = {
    run_id: review.run_id,
    agent_id: review.agent_id,
    agent_name: review.agent_name ?? null,
    verdict: review.verdict,
    score: review.score,
    findings_count: findingsCount,
    created_at: review.created_at,
  };
  if (format === 'concise') return base;
  return { ...base, review_id: review.id, summary: review.summary, model: review.model };
}

export function projectConvention(c: ConventionWire, format: ResponseFormat): ConventionOutput {
  const base: ConventionOutput = {
    rule: c.rule,
    category: c.category,
    status: c.status,
    evidence: `${c.evidence_path}:${c.evidence_line}`,
  };
  if (format === 'concise') return base;
  return {
    ...base,
    id: c.id,
    rationale: c.rationale ?? null,
    evidence_snippet: c.evidence_snippet,
    confidence: c.confidence,
    created_at: c.created_at,
  };
}
