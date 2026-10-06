/* DocPreview — one doc's path, source badge, tokens, "Used by" and its markdown.
   Shared by the Project Context page (right pane) and the editors' drawer.
   The text goes through Markdown only (no raw HTML), so a <script> in a doc
   shows as text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Markdown, Skeleton } from "@devdigest/ui";
import type { SpecFile } from "@devdigest/shared";
import { s } from "./styles";

export function DocPreview({
  doc,
  loading,
  error,
}: {
  doc: SpecFile | undefined;
  loading?: boolean;
  error?: boolean;
}) {
  const t = useTranslations("context");
  if (error) return <div style={s.note}>{t("editor.loadError")}</div>;
  if (loading || !doc) return <Skeleton height={120} />;
  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <span className="mono" style={s.path}>
          {doc.path}
        </span>
        {doc.source && <Badge mono>{doc.source}</Badge>}
      </div>
      <div style={s.head}>
        {doc.tokens != null && <span style={s.meta}>{t("tokens", { count: doc.tokens })}</span>}
        {doc.used_by != null && <span style={s.meta}>{t("usedBy", { count: doc.used_by })}</span>}
      </div>
      <div style={s.body}>
        <Markdown>{doc.content}</Markdown>
      </div>
    </div>
  );
}
