/* hooks/conventions.ts — React Query hooks for the L02 Conventions board.
   Every conventions call goes through here; components never call `api` directly. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionSkillDraft,
  ConventionStatus,
} from "@devdigest/shared";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/**
 * Scan the repo. A MUTATION, not a query: it costs a model call, so it must
 * never run on mount, on a refocus or on a retry. Its response already carries
 * the new board, so it seeds the list cache instead of forcing a refetch.
 */
export function useExtractConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<ConventionExtractResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data, repoId) => {
      qc.setQueryData(["conventions", repoId], data.candidates);
    },
  });
}

export interface UpdateConventionInput {
  id: string;
  repoId: string;
  patch: { rule?: string; rationale?: string | null; status?: ConventionStatus };
}

export function useUpdateConvention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionInput) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (_data, { repoId }) => {
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}

export function useDeleteConvention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; repoId: string }) => api.del<void>(`/conventions/${id}`),
    onSuccess: (_data, { repoId }) => {
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}

/**
 * Assemble the selected candidates into a skill. Persists NOTHING: the modal
 * shows the draft, the user edits it, and only then `useCreateSkill` stores it.
 */
export function useConventionSkillDraft() {
  return useMutation({
    mutationFn: ({ repoId, ids }: { repoId: string; ids: string[] }) =>
      api.post<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill`, {
        convention_ids: ids,
      }),
  });
}
