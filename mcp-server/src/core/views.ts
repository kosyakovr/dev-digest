/**
 * Ring ①: plain result shapes produced by the use cases and consumed by the
 * renderer. These are internal view models, not wire formats, so they are
 * interfaces rather than schemas. Imports ring-① types only.
 */
import type { Convention, Finding } from './schemas.ts';

export type RunStatus = 'done' | 'failed' | 'cancelled' | 'running';
export type Severity = 'CRITICAL' | 'WARNING' | 'SUGGESTION';

export interface ReviewView {
  /** `owner/repo#N`, or the PR uuid when the caller gave one. */
  prLabel: string;
  runId: string | null;
  status: RunStatus;
  /** True when `run_agent_on_pr` attached to a run that was already in progress. */
  attached: boolean;
  agentName: string | null;
  verdict: string | null;
  score: number | null;
  durationMs: number | null;
  /** null = unknown, never 0. */
  costUsd: number | null;
  summary: string | null;
  error: string | null;
  counts: Record<Severity, number>;
  /** Visible page of non-dismissed findings, sorted. */
  findings: Finding[];
  /** Non-dismissed findings at or above min severity, before paging. */
  total: number;
  offset: number;
  dismissedHidden: number;
  note: string | null;
}

export interface ConventionsView {
  /** `owner/repo` or the repo uuid. */
  repoLabel: string;
  status: 'accepted' | 'pending' | 'rejected' | 'all';
  items: Convention[];
  total: number;
  offset: number;
}
