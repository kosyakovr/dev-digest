/* SkillCard — name, type chip, description, enabled toggle. Used by the Skills
   grid and by the rail in the editor, exactly as AgentCard is. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill } from "../../../../lib/hooks/skills";
import { typeColor } from "../../helpers";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const del = useDeleteSkill();
  const color = typeColor(skill.type);

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={15} />
        </div>
        <span style={s.name}>{skill.name}</span>
        {onToggle && (
          // Stop the click here, or toggling would also navigate into the editor.
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(t("card.deleteConfirm", { name: skill.name }))) {
              del.mutate(skill.id);
            }
          }}
          disabled={del.isPending}
          title={t("card.deleteTitle")}
          aria-label={t("card.deleteTitle")}
          style={s.deleteBtn(del.isPending)}
        >
          <Icon.Trash
            size={14}
            style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined}
          />
        </button>
      </div>
      <div style={s.description}>{skill.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <span className="mono" style={s.typeChip(color)}>
          {skill.type}
        </span>
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
          {t("preview.version", { version: skill.version })}
        </span>
      </div>
    </div>
  );
}
