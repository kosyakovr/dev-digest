/* hooks/brief.ts — React Query hooks for the L05 Risk Brief on the PR Overview.
   Every brief call goes through here; components never call `api` directly. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrBriefResponse } from "@devdigest/shared";

const POLL_MS = 5_000;

/** Read the stored brief. Never costs a model call; polls while a generation runs elsewhere. */
export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-brief", prId],
    queryFn: () => api.get<PrBriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId,
    refetchInterval: (q) => (q.state.data?.generating ? POLL_MS : false),
  });
}

/**
 * Generate (or regenerate) the brief. A MUTATION, not a query: it costs a model
 * call, so it must never run on mount, refocus or retry. The response seeds the
 * cache; the Intent card is refreshed because a missing intent is derived first.
 */
export function useGeneratePrBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBriefResponse>(`/pulls/${prId}/brief`),
    onSuccess: (data) => {
      qc.setQueryData(["pr-brief", prId], data);
      qc.invalidateQueries({ queryKey: ["pr-intent", prId] });
    },
  });
}
