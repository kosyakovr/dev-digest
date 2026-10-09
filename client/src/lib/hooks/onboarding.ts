/* hooks/onboarding.ts — React Query hooks for the L05 Onboarding Tour page.
   Every tour call goes through here; components never call `api` directly. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { OnboardingTourState } from "@devdigest/shared";

const POLL_MS = 5_000;

/** Read the stored tour. Never costs a model call; polls while a generation runs elsewhere. */
export function useOnboardingTour(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["onboarding-tour", repoId],
    queryFn: () => api.get<OnboardingTourState>(`/repos/${repoId}/tour`),
    enabled: !!repoId,
    refetchInterval: (q) => (q.state.data?.generating ? POLL_MS : false),
  });
}

/**
 * Generate (or regenerate) the tour. A MUTATION, not a query: it can cost a
 * model call, so it must never run on mount, refocus or retry. The response
 * is the new state, so it seeds the cache instead of forcing a refetch.
 */
export function useGenerateOnboardingTour() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<OnboardingTourState>(`/repos/${repoId}/tour/generate`),
    onSuccess: (data, repoId) => {
      qc.setQueryData(["onboarding-tour", repoId], data);
    },
  });
}
