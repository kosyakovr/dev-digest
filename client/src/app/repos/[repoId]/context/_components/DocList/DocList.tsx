/* DocList — the Project Context page's left panel: a filter and the docs
   grouped under their source folder. Each item is a button named by its path. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { SpecFile } from "@devdigest/shared";
import { buildSections } from "@/lib/context-sections";
import { s } from "./styles";

export function DocList({
  docs,
  selected,
  filter,
  onFilter,
  onSelect,
}: {
  docs: SpecFile[];
  selected: string | null;
  filter: string;
  onFilter: (v: string) => void;
  onSelect: (path: string) => void;
}) {
  const t = useTranslations("context");
  const { groups } = buildSections(docs, [], filter);
  return (
    <div style={s.wrap}>
      <div style={s.filter}>
        <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
        <input
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
          placeholder={t("filterPlaceholder")}
          aria-label={t("filterPlaceholder")}
          style={s.filterInput}
        />
      </div>
      {groups.map((g) => (
        <section key={g.source}>
          <h2 style={s.groupHead}>{g.source}</h2>
          {g.rows.map((r) => (
            <button
              key={r.path}
              type="button"
              onClick={() => onSelect(r.path)}
              aria-pressed={selected === r.path}
              style={s.item(selected === r.path)}
            >
              <span className="mono" style={s.path}>
                {r.path}
              </span>
              {r.doc?.tokens != null && <span style={s.tokens}>{t("tokens", { count: r.doc.tokens })}</span>}
              {r.doc?.source && <Badge mono>{r.doc.source}</Badge>}
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
