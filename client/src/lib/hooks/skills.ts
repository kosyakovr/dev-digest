/* hooks/skills.ts — React Query hooks for the L02 Skills page + Skill editor.
   Every skills call goes through here; components never call `api` directly. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Skill, SkillImportPreview, SkillTypeItem, SkillVersion } from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

/** The type catalogue behind the editor's creatable dropdown. */
export function useSkillTypes() {
  return useQuery({
    queryKey: ["skill-types"],
    queryFn: () => api.get<SkillTypeItem[]>("/skill-types"),
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description?: string;
  type: string;
  body: string;
  enabled?: boolean;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      // A save may have introduced a brand-new type name.
      qc.invalidateQueries({ queryKey: ["skill-types"] });
    },
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">>;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
      qc.invalidateQueries({ queryKey: ["skill-types"] });
      // A body edit appends a version; a metadata edit does not. Refetching is
      // cheaper than replicating that rule in the client.
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
      qc.removeQueries({ queryKey: ["skill-versions", id] });
    },
  });
}

/**
 * Roll a skill back to `version`, DELETING every newer version. Destructive —
 * the Versions tab confirms before calling this.
 */
export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
    },
  });
}

/**
 * Parse an uploaded markdown file server-side. Persists NOTHING: the import
 * dialog shows the result and only then calls `useCreateSkill`.
 */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (input: { filename: string; content: string }) =>
      api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}
