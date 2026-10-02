/**
 * Ring ①: tolerant response schemas for the DevDigest HTTP API.
 * Only the fields this package reads are declared; unknown fields are
 * stripped (tolerant reader), so additive API changes do not break us. Types are `z.infer`
 * of these schemas. Imports `zod` only: no HTTP, no MCP SDK, no env here.
 * `severity`/`category` are plain strings because the DB columns are free text.
 */
import { z } from 'zod';

export const Repo = z
  .object({
    id: z.string(),
    full_name: z.string(),
  });
export type Repo = z.infer<typeof Repo>;

export const Pull = z
  .object({
    id: z.string(),
    number: z.number().int(),
    title: z.string().nullish(),
  });
export type Pull = z.infer<typeof Pull>;

export const Agent = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullish(),
    provider: z.string(),
    model: z.string(),
    enabled: z.boolean(),
    version: z.number().int().nullish(),
    strategy: z.string().nullish(),
    ci_fail_on: z.string().nullish(),
    repo_intel: z.boolean().nullish(),
  });
export type Agent = z.infer<typeof Agent>;

export const RunTarget = z
  .object({
    run_id: z.string(),
    agent_id: z.string().nullish(),
    agent_name: z.string().nullish(),
  });
export type RunTarget = z.infer<typeof RunTarget>;

/** Response of `POST /pulls/:id/review` (the run continues in the background). */
export const StartReviewResult = z
  .object({
    pr_id: z.string(),
    runs: z.array(RunTarget).min(1),
  });
export type StartReviewResult = z.infer<typeof StartReviewResult>;

/** A run that is `running` right now (`GET /pulls/:id/runs/active`). */
export const ActiveRun = z
  .object({
    run_id: z.string(),
    agent_id: z.string().nullish(),
    agent_name: z.string().nullish(),
    ran_at: z.string().nullish(),
  });
export type ActiveRun = z.infer<typeof ActiveRun>;

export const RunEvent = z
  .object({
    runId: z.string(),
    seq: z.number().int(),
    kind: z.string(),
    msg: z.string(),
  });
export type RunEvent = z.infer<typeof RunEvent>;

export const RunSummary = z
  .object({
    run_id: z.string(),
    agent_id: z.string().nullish(),
    agent_name: z.string().nullish(),
    status: z.string().nullish(),
    error: z.string().nullish(),
    duration_ms: z.number().nullish(),
    cost_usd: z.number().nullish(),
    findings_count: z.number().nullish(),
    score: z.number().nullish(),
  });
export type RunSummary = z.infer<typeof RunSummary>;

export const Finding = z
  .object({
    id: z.string(),
    severity: z.string(),
    category: z.string().nullish(),
    title: z.string(),
    file: z.string(),
    start_line: z.number().int(),
    end_line: z.number().int().nullish(),
    rationale: z.string().nullish(),
    suggestion: z.string().nullish(),
    confidence: z.number().nullish(),
    dismissed_at: z.string().nullish(),
  });
export type Finding = z.infer<typeof Finding>;

export const Review = z
  .object({
    id: z.string(),
    run_id: z.string().nullish(),
    agent_id: z.string().nullish(),
    agent_name: z.string().nullish(),
    kind: z.string(),
    verdict: z.string().nullish(),
    summary: z.string().nullish(),
    score: z.number().nullish(),
    created_at: z.string().nullish(),
    findings: z.array(Finding),
  });
export type Review = z.infer<typeof Review>;

export const Convention = z
  .object({
    id: z.string(),
    rule: z.string(),
    rationale: z.string().nullish(),
    category: z.string(),
    evidence_path: z.string(),
    evidence_line: z.number().int(),
    evidence_snippet: z.string().nullish(),
    confidence: z.number().nullish(),
    status: z.string(),
  });
export type Convention = z.infer<typeof Convention>;

export const ApiErrorBody = z
  .object({
    error: z
      .object({
        code: z.string().nullish(),
        message: z.string(),
      }),
  });
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

export const Repos = z.array(Repo);
export const Pulls = z.array(Pull);
export const Agents = z.array(Agent);
export const ActiveRuns = z.array(ActiveRun);
export const RunSummaries = z.array(RunSummary);
export const Reviews = z.array(Review);
export const Conventions = z.array(Convention);
