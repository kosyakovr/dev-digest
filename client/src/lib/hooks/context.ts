/* hooks/context.ts — Project Context (L05): the repo's docs, and the docs
   attached to an agent or a skill. The doc list and a single doc are read-only
   queries; the attachment lists are replaced whole by a PUT. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentContext, ContextItem, ContextPaths, ContextSources, IndexStatus, SpecFile } from "@devdigest/shared";

/** The configured source folders (names only), for the empty-state copy. */
export function useContextSources() {
  return useQuery({
    queryKey: ["context-sources"],
    queryFn: () => api.get<ContextSources>("/context/sources"),
  });
}

/** Every `.md` doc under the source folders, with source and tokens (content is null). */
export function useContextFiles(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context", repoId],
    queryFn: () => api.get<SpecFile[]>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

/** One doc with its content and the number of agents using it. */
export function useContextFile(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["context-file", repoId, path],
    queryFn: () => api.get<SpecFile>(`/repos/${repoId}/context/file?path=${encodeURIComponent(path ?? "")}`),
    enabled: !!repoId && !!path,
  });
}

/** An agent's attached docs, plus the docs it inherits through its skills. */
export function useAgentContext(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-context", agentId],
    queryFn: () => api.get<AgentContext>(`/agents/${agentId}/context`),
    enabled: !!agentId,
  });
}

/** Replace an agent's whole attachment list in one PUT. */
export function useSetAgentContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, items }: { agentId: string; items: ContextItem[] }) =>
      api.put<AgentContext>(`/agents/${agentId}/context`, { items }),
    onSuccess: (data, { agentId }) => {
      qc.setQueryData(["agent-context", agentId], data);
    },
  });
}

export function useSkillContext(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-context", skillId],
    queryFn: () => api.get<ContextPaths>(`/skills/${skillId}/context`),
    enabled: !!skillId,
  });
}

/** Replace a skill's whole attachment list in one PUT. */
export function useSetSkillContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ skillId, items }: { skillId: string; items: ContextItem[] }) =>
      api.put<ContextPaths>(`/skills/${skillId}/context`, { items }),
    onSuccess: (data, { skillId }) => {
      qc.setQueryData(["skill-context", skillId], data);
      // Agents inherit through their skills, so their cached lists are stale now.
      qc.invalidateQueries({ queryKey: ["agent-context"] });
    },
  });
}

/** Unserved today (POST /repos/:id/context/reindex has no route). */
export function useReindexContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<IndexStatus>(`/repos/${repoId}/context/reindex`),
    onSuccess: (_d, repoId) => qc.invalidateQueries({ queryKey: ["context", repoId] }),
  });
}
