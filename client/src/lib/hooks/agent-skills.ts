/* hooks/agent-skills.ts — the agent↔skill link surface used by the Agent
   editor's Skills tab. Separate from hooks/agents.ts because the cache key is
   the LINK set, not the agent itself. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentSkillLink } from "@devdigest/shared";

/** An agent's linked skills, already ordered by the server. */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/**
 * Replace an agent's whole ordered link set. Array order IS prompt order, and
 * `enabled` mutes a skill without detaching it (which would lose its place).
 */
export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      skills,
    }: {
      agentId: string;
      skills: { skill_id: string; enabled: boolean }[];
    }) => api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skills }),
    onSuccess: (data, { agentId }) => {
      qc.setQueryData(["agent-skills", agentId], data);
    },
  });
}
