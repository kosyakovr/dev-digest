/* Preview tab — the skill body rendered read-only, as the reviewer will read it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown, Badge } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { typeColor } from "../../../../../helpers";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <span className="mono" style={s.typeChip(typeColor(skill.type))}>
          {skill.type}
        </span>
        <Badge color="var(--text-muted)">{t("preview.version", { version: skill.version })}</Badge>
        <Badge color="var(--text-muted)">
          {skill.enabled ? t("preview.enabled") : t("preview.disabled")}
        </Badge>
      </div>
      <div style={s.body}>
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
