/* hooks/intent.ts — React Query hooks for the L03 PR intent card.
   Every intent call goes through here; components never call `api` directly. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentResponse } from "@devdigest/shared";

export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-intent", prId],
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/**
 * Derive (or re-derive) the intent. A MUTATION, never run on mount: it costs a
 * model call. The response is the new record, so it seeds the cache directly.
 */
export function useDeriveIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentResponse>(`/pulls/${prId}/intent`),
    onSuccess: (data) => {
      qc.setQueryData(["pr-intent", prId], data);
    },
  });
}
