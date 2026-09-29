/**
 * Use case (ring ②) — pure formatting, sorting and paging helpers shared by
 * every tool. No I/O: only ① types and values in, plain objects out. Must
 * not import the SDK, `fetch`, the environment, `api/`, `tools/`,
 * `server.ts`, `index.ts`, `config.ts` or `log.ts`.
 */
import type { AgentWire, ConventionWire, FindingWire, ReviewWire } from './contracts.js';
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

export interface AgentConcise {
  id: string;
  name: string;
  enabled: boolean;
  model: string;
}
export interface AgentDetailed extends AgentConcise {
  description?: string;
  provider?: string;
  strategy?: string;
  version?: number;
}

export function projectAgent(agent: AgentWire, format: ResponseFormat): AgentConcise | AgentDetailed {
  const base: AgentConcise = { id: agent.id, name: agent.name, enabled: agent.enabled, model: agent.model };
  if (format === 'concise') return base;
  const detailed: AgentDetailed = { ...base };
  if (agent.description !== undefined) detailed.description = agent.description;
  if (agent.provider !== undefined) detailed.provider = agent.provider;
  if (agent.strategy !== undefined) detailed.strategy = agent.strategy;
  if (agent.version !== undefined) detailed.version = agent.version;
  return detailed;
}

export interface FindingConcise {
  severity: string;
  title: string;
  loc: string;
  agent_name: string | null;
}
export interface FindingDetailed extends FindingConcise {
  id: string;
  category: string;
  rationale: string;
  suggestion: string | null;
  confidence: number;
  kind: string | null;
  run_id: string | null;
}

/** Used by `devdigest_get_findings` — the finding shape carries `agent_name`
 * (the review it came from may not be the caller's own). */
export function projectFinding(
  f: FindingWire,
  format: ResponseFormat,
  ctx: { agentName: string | null; runId: string | null },
): FindingConcise | FindingDetailed {
  const base: FindingConcise = {
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

export interface ReviewConcise {
  run_id: string | null;
  agent_id: string | null;
  agent_name: string | null;
  verdict: string | null;
  score: number | null;
  findings_count: number;
  created_at: string;
}
export interface ReviewDetailed extends ReviewConcise {
  review_id: string;
  summary: string | null;
  model: string | null;
}

export function projectReview(
  review: ReviewWire,
  format: ResponseFormat,
  findingsCount: number,
): ReviewConcise | ReviewDetailed {
  const base: ReviewConcise = {
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

export interface ConventionConcise {
  rule: string;
  category: string;
  status: string;
  evidence: string;
}
export interface ConventionDetailed extends ConventionConcise {
  id: string;
  rationale: string | null;
  evidence_snippet: string;
  confidence: number;
  created_at: string;
}

export function projectConvention(c: ConventionWire, format: ResponseFormat): ConventionConcise | ConventionDetailed {
  const base: ConventionConcise = {
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
