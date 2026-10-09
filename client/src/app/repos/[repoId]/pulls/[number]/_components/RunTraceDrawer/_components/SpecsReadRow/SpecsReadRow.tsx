/* SpecsReadRow — one attached doc in the Trace's "Specs read": its path, then
   either its tokens or why it was skipped plus a link to where to remove it. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ProjectContextEntry } from "@devdigest/shared";
import { s } from "../../styles";

export function SpecsReadRow({ entry, agentId }: { entry: ProjectContextEntry; agentId?: string | null }) {
  const t = useTranslations("runs");
  const skipped = entry.status === "skipped";
  // A doc inherited from a skill is removed on the skill; a direct one on the agent.
  const link = entry.via_skill
    ? { href: `/skills/${entry.via_skill.id}?tab=context`, label: t("trace.config.removeFromSkill", { name: entry.via_skill.name }) }
    : agentId
      ? { href: `/agents/${agentId}?tab=context`, label: t("trace.config.removeFromAgent") }
      : null;
  return (
    <div style={s.specEntry}>
      <span className="mono" style={s.spec}>
        {entry.path}
      </span>
      {skipped ? (
        <>
          <span style={s.specSkipped}>{t(`trace.config.skipped.${entry.reason ?? "unreadable"}`)}</span>
          {link && (
            <Link href={link.href} style={s.specLink}>
              {link.label}
            </Link>
          )}
        </>
      ) : (
        <span style={s.specMeta}>{t("trace.config.specTokens", { count: entry.tokens })}</span>
      )}
    </div>
  );
}
