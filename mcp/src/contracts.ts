/**
 * Contracts (ring ①) — local, lenient wire schemas for the fields the tools
 * actually read from each server response. Imports only `zod`.
 *
 * D2-O3: each schema covers a SUBSET of its paired `@devdigest/shared`
 * contract (see `mcp/test/contract-pin.test.ts`), stripped of unknown keys
 * (plain `z.object`, never `.strict()`), with loosely-typed enums
 * (`severity`/`verdict`/`status`/`category` are `z.string()`) so a value the
 * server adds to an enum does not break this process. Every schema is an
 * exported `z.object` so the pin test can read `.shape`.
 */
import { z } from 'zod';

// ---- Agents — paired with @devdigest/shared Agent ----
export const AgentWire = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  provider: z.string().optional(),
  model: z.string(),
  enabled: z.boolean(),
  strategy: z.string().optional(),
  version: z.number().optional(),
});
export type AgentWire = z.infer<typeof AgentWire>;
export const AgentWireList = z.array(AgentWire);

// ---- Repos — paired with @devdigest/shared Repo ----
export const RepoWire = z.object({
  id: z.string(),
  full_name: z.string(),
});
export type RepoWire = z.infer<typeof RepoWire>;
export const RepoWireList = z.array(RepoWire);

// ---- Pulls — paired with @devdigest/shared PrMeta / PrDetail ----
export const PullListItemWire = z.object({
  id: z.string().nullish(),
  number: z.number(),
  title: z.string(),
});
export type PullListItemWire = z.infer<typeof PullListItemWire>;
export const PullListItemWireList = z.array(PullListItemWire);

export const PullDetailWire = z.object({
  id: z.string().nullish(),
  number: z.number(),
  title: z.string(),
});
export type PullDetailWire = z.infer<typeof PullDetailWire>;

// ---- Review run trigger — paired with ReviewRunTarget / ReviewRunResponse ----
export const ReviewRunTargetWire = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
});
export type ReviewRunTargetWire = z.infer<typeof ReviewRunTargetWire>;

export const ReviewRunResponseWire = z.object({
  pr_id: z.string(),
  runs: z.array(ReviewRunTargetWire),
});
export type ReviewRunResponseWire = z.infer<typeof ReviewRunResponseWire>;

// ---- Run history — paired with @devdigest/shared RunSummary ----
export const RunSummaryWire = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  status: z.string().nullable(),
  error: z.string().nullable(),
  duration_ms: z.number().nullable(),
  cost_usd: z.number().nullable(),
  findings_count: z.number().nullable(),
});
export type RunSummaryWire = z.infer<typeof RunSummaryWire>;
export const RunSummaryWireList = z.array(RunSummaryWire);

// ---- Findings — paired with @devdigest/shared FindingRecord ----
export const FindingWire = z.object({
  id: z.string(),
  severity: z.string(),
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number(),
  end_line: z.number(),
  rationale: z.string(),
  suggestion: z.string().nullish(),
  confidence: z.number(),
  kind: z.string().nullish(),
  dismissed_at: z.string().nullable(),
});
export type FindingWire = z.infer<typeof FindingWire>;

// ---- Reviews — paired with @devdigest/shared ReviewRecord ----
export const ReviewWire = z.object({
  id: z.string(),
  run_id: z.string().nullable(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullish(),
  kind: z.string(),
  verdict: z.string().nullable(),
  summary: z.string().nullable(),
  score: z.number().nullable(),
  model: z.string().nullable(),
  created_at: z.string(),
  findings: z.array(FindingWire),
});
export type ReviewWire = z.infer<typeof ReviewWire>;
export const ReviewWireList = z.array(ReviewWire);

// ---- Conventions — paired with @devdigest/shared ConventionCandidate ----
export const ConventionWire = z.object({
  id: z.string(),
  rule: z.string(),
  rationale: z.string().nullish(),
  category: z.string(),
  evidence_path: z.string(),
  evidence_line: z.number(),
  evidence_snippet: z.string(),
  confidence: z.number(),
  status: z.string(),
  created_at: z.string(),
});
export type ConventionWire = z.infer<typeof ConventionWire>;
export const ConventionWireList = z.array(ConventionWire);

// ---- SSE run events — paired with @devdigest/shared RunEvent ----
export const RunEventWire = z.object({
  seq: z.number(),
  kind: z.string(),
  msg: z.string(),
});
export type RunEventWire = z.infer<typeof RunEventWire>;

// ---- Error envelope — paired with @devdigest/shared ApiErrorBody ----
export const ApiErrorBodyWire = z.object({
  error: z.object({
    message: z.string(),
  }),
});
export type ApiErrorBodyWire = z.infer<typeof ApiErrorBodyWire>;

// ============================================================================
// MCP tool outputs — each tool's `structuredContent` shape (Contract §
// Common output, per-tool § Output). Local to this package, one source of
// truth for the `outputSchema` an SDK tool registers, the type a use case
// returns, and the type `format.ts`'s projectors build — NOT paired with a
// server contract, so NOT covered by `mcp/test/contract-pin.test.ts`.
// ============================================================================

export const AgentOutput = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  model: z.string(),
  description: z.string().optional(),
  provider: z.string().optional(),
  strategy: z.string().optional(),
  version: z.number().optional(),
});
export type AgentOutput = z.infer<typeof AgentOutput>;

export const ListAgentsOutput = z.object({
  agents: z.array(AgentOutput),
  count: z.number(),
  hint: z.string().optional(),
});
export type ListAgentsOutput = z.infer<typeof ListAgentsOutput>;

export const RunReviewFindingOutput = z.object({
  severity: z.string(),
  title: z.string(),
  loc: z.string(),
  category: z.string(),
});
export type RunReviewFindingOutput = z.infer<typeof RunReviewFindingOutput>;

export const RunReviewOutput = z.object({
  untrusted_notice: z.string(),
  status: z.enum(['done', 'running']),
  pr: z.string(),
  pr_title: z.string(),
  run_id: z.string(),
  agent_id: z.string().optional(),
  agent_name: z.string(),
  verdict: z.string().nullable().optional(),
  score: z.number().nullable().optional(),
  summary: z.string().nullable().optional(),
  findings_count: z.number().optional(),
  cost_usd: z.number().nullable().optional(),
  duration_ms: z.number().nullable().optional(),
  findings: z.array(RunReviewFindingOutput).optional(),
  omitted: z.number().optional(),
  elapsed_s: z.number().optional(),
  hint: z.string().optional(),
});
export type RunReviewOutput = z.infer<typeof RunReviewOutput>;

export const GetFindingsReviewOutput = z.object({
  run_id: z.string().nullable(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  verdict: z.string().nullable(),
  score: z.number().nullable(),
  findings_count: z.number(),
  created_at: z.string(),
  review_id: z.string().optional(),
  summary: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
});
export type GetFindingsReviewOutput = z.infer<typeof GetFindingsReviewOutput>;

export const GetFindingsFindingOutput = z.object({
  severity: z.string(),
  title: z.string(),
  loc: z.string(),
  agent_name: z.string().nullable(),
  id: z.string().optional(),
  category: z.string().optional(),
  rationale: z.string().optional(),
  suggestion: z.string().nullable().optional(),
  confidence: z.number().optional(),
  kind: z.string().nullable().optional(),
  run_id: z.string().nullable().optional(),
});
export type GetFindingsFindingOutput = z.infer<typeof GetFindingsFindingOutput>;

export const GetFindingsOutput = z.object({
  untrusted_notice: z.string(),
  pr: z.string(),
  pr_title: z.string(),
  pr_id: z.string().optional(),
  status: z.literal('running').optional(),
  run_id: z.string().optional(),
  agent_name: z.string().nullable().optional(),
  reviews: z.array(GetFindingsReviewOutput),
  findings: z.array(GetFindingsFindingOutput),
  total: z.number(),
  next_cursor: z.string().nullable(),
  hint: z.string().optional(),
});
export type GetFindingsOutput = z.infer<typeof GetFindingsOutput>;

export const ConventionOutput = z.object({
  rule: z.string(),
  category: z.string(),
  status: z.string(),
  evidence: z.string(),
  id: z.string().optional(),
  rationale: z.string().nullable().optional(),
  evidence_snippet: z.string().optional(),
  confidence: z.number().optional(),
  created_at: z.string().optional(),
});
export type ConventionOutput = z.infer<typeof ConventionOutput>;

export const GetConventionsOutput = z.object({
  untrusted_notice: z.string(),
  repo: z.string(),
  repo_id: z.string().optional(),
  conventions: z.array(ConventionOutput),
  total: z.number(),
  truncated: z.boolean(),
  hint: z.string().optional(),
});
export type GetConventionsOutput = z.infer<typeof GetConventionsOutput>;
