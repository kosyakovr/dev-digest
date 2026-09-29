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
