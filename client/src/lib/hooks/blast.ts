/* hooks/blast.ts — React Query hooks for the PR Overview "Blast radius" card.
     GET /pulls/:id/blast    → BlastRadius (persistent index only)
     GET /pulls/:id/history  → PrHistory   (prior merged PRs, read from GitHub)
   Components never call `api` directly. */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BlastRadius, PrHistory } from "@devdigest/shared";
import { api } from "../api";
import { useRepoIntelStatus, useResyncRepoIntel } from "./repo-intel";

/** History costs up to ~30 GitHub calls — keep a result fresh for 5 minutes. */
const HISTORY_STALE_MS = 5 * 60_000;
/** Stop waiting for a resync to land after this long. */
const RESYNC_POLL_MAX_MS = 120_000;

export function usePrBlast(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-blast", prId],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}

export function usePrHistory(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-history", prId],
    queryFn: () => api.get<PrHistory>(`/pulls/${prId}/history`),
    enabled: !!prId,
    staleTime: HISTORY_STALE_MS,
  });
}

/**
 * Re-index the repo and reload the blast when it lands. `start()` remembers the
 * index-state `updatedAt`, POSTs the resync and polls the state; once
 * `updatedAt` changes the blast query is invalidated. Gives up after
 * RESYNC_POLL_MAX_MS.
 */
export function useBlastResync(repoId: string | null | undefined, prId: string | null | undefined) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const baseline = useRef<string | null>(null);
  const status = useRepoIntelStatus(repoId, running);
  const resync = useResyncRepoIntel(repoId);
  const updatedAt = status.data?.updatedAt ?? null;

  // Sync the query cache with the external index: reload the blast on completion.
  useEffect(() => {
    if (!running || updatedAt === null || updatedAt === baseline.current) return;
    qc.invalidateQueries({ queryKey: ["pr-blast", prId] });
    setRunning(false);
  }, [running, updatedAt, prId, qc]);

  // Stop polling after the ceiling.
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => setRunning(false), RESYNC_POLL_MAX_MS);
    return () => clearTimeout(timer);
  }, [running]);

  const { mutate } = resync;
  const start = useCallback(() => {
    baseline.current = updatedAt;
    setRunning(true);
    mutate(undefined, { onError: () => setRunning(false) });
  }, [updatedAt, mutate]);

  return { start, running, error: resync.error ?? null } as {
    start: () => void;
    running: boolean;
    error: Error | null;
  };
}
