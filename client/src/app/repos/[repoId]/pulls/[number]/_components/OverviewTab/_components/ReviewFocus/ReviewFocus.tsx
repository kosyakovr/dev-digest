/* ReviewFocus — "read these first": the brief's grounded file:line items, each
   a button that opens Files changed. Model text is rendered as plain text (NFR-5). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, SectionLabel, Skeleton } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { s } from "./styles";

export function ReviewFocus({
  items,
  loading,
  notInDiff,
  onOpen,
}: {
  items: ReviewFocusItem[];
  loading: boolean;
  /** True after the user opened a file that is not in this PR's diff. */
  notInDiff: boolean;
  onOpen: (file: string, line: number) => void;
}) {
  const t = useTranslations("brief");
  return (
    <section>
      <SectionLabel icon="Eye" right={!loading && items.length > 0 ? <Badge>{items.length}</Badge> : undefined}>
        {t("focus.title")}
      </SectionLabel>
      {notInDiff && (
        <div role="status" style={s.notice}>
          {t("notInDiff")}
        </div>
      )}
      {loading ? (
        <Skeleton height={60} />
      ) : items.length === 0 ? (
        <div style={s.muted}>{t("focus.empty")}</div>
      ) : (
        <ul style={s.list}>
          {items.map((item) => (
            <li key={`${item.file}:${item.line}`}>
              <button
                type="button"
                style={s.row}
                aria-label={t("focus.open", { file: item.file, line: item.line })}
                onClick={() => onOpen(item.file, item.line)}
              >
                <span className="mono">{`${item.file}:${item.line} — ${item.reason}`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
