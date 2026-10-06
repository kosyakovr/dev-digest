/* ContextDocsEditor — the shared body of the agent and skill Context tabs.
   Lists the repo's docs (manual block, then source groups, then attached docs
   missing from the repo), lets the user attach, reorder and preview them, and
   hands the whole attachment list to `onSave` in one call.

   The draft is local state seeded from `items`; reordering is offered only
   while the filter is empty, as in the Skills tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { ContextItem } from "@devdigest/shared";
import { useActiveRepo } from "@/lib/repo-context";
import { useContextFiles, useContextSources } from "@/lib/hooks/context";
import { SOFT_CAP_TOKENS } from "../constants";
import {
  buildSections,
  canMoveDown,
  canMoveUp,
  dropOn,
  flatOrder,
  inheritedSummary,
  moveDown,
  moveUp,
  toPayload,
  toggle,
  total,
  type Draft,
  type DocRow,
} from "../helpers";
import { DocRowItem, type DocRowItemProps } from "./_components/DocRowItem";
import { PreviewDrawer } from "./_components/PreviewDrawer";
import { s } from "./styles";

export interface ContextDocsEditorProps {
  /** The attached docs as stored; the draft resets when their content changes. */
  items: ContextItem[];
  /** Docs inherited through skills (agent tab only). */
  inherited?: { skill_id: string; skill_name: string; items: ContextItem[] }[];
  note?: string;
  saving: boolean;
  onSave: (items: ContextItem[]) => void;
}

export function ContextDocsEditor({ items, inherited = [], note, saving, onSave }: ContextDocsEditorProps) {
  const t = useTranslations("context");
  const { repoId, activeRepo } = useActiveRepo();
  const { data: docs, isLoading, isError, error, refetch } = useContextFiles(repoId);
  const { data: sources } = useContextSources();

  const [draft, setDraft] = React.useState<Draft>(items);
  const [filter, setFilter] = React.useState("");
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  // The draft follows the saved data by CONTENT, not identity: adjust state
  // during render when the saved items actually change (a save, a refetch that
  // returns different items). An equal but new array leaves unsaved edits alone.
  const itemsKey = items.map((i) => `${i.path}:${i.position}`).join("|");
  const [seenKey, setSeenKey] = React.useState(itemsKey);
  if (seenKey !== itemsKey) {
    setSeenKey(itemsKey);
    setDraft(items);
  }

  if (repoId && isLoading) return <Skeleton height={180} />;

  const list = repoId && !isError ? (docs ?? []) : null;
  const sections = buildSections(list, draft, filter);
  const order = flatOrder(sections);
  const reorderable = filter.trim() === "";
  const sum = total(draft, list, inherited);
  const inheritedInfo = inheritedSummary(inherited, list);
  const repoName = activeRepo?.full_name ?? "";

  // Props for one row (plain data, not JSX): the row itself is <DocRowItem />.
  const rowProps = (r: DocRow, missing: boolean): DocRowItemProps => {
    const canDrag = reorderable && r.attached;
    return {
      row: r,
      showNotFound: missing && !!list,
      repoName,
      canDrag,
      canMoveUp: canDrag && canMoveUp(draft, r.path),
      canMoveDown: canDrag && canMoveDown(draft, r.path),
      dragging: dragPath === r.path,
      onDragStart: () => canDrag && setDragPath(r.path),
      onDragEnd: () => setDragPath(null),
      onDragOver: (e) => reorderable && dragPath && e.preventDefault(),
      onDrop: () => {
        if (reorderable && dragPath) setDraft(dropOn(draft, order, dragPath, r.path));
        setDragPath(null);
      },
      onToggle: () => setDraft(toggle(draft, r.path)),
      onPreview: () => setPreviewPath(r.path),
      onMoveUp: () => setDraft(moveUp(draft, r.path)),
      onMoveDown: () => setDraft(moveDown(draft, r.path)),
    };
  };

  const folders = (sources?.folders ?? []).join(", ");

  return (
    <div style={s.wrap}>
      <div style={s.filter}>
        <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("filterPlaceholder")}
          aria-label={t("filterPlaceholder")}
          style={s.filterInput}
        />
      </div>
      {!reorderable && <p style={s.hint}>{t("editor.reorderLocked")}</p>}

      {inheritedInfo.count > 0 && (
        <div style={s.inherited}>
          {t("editor.inherited", { count: inheritedInfo.count, tokens: inheritedInfo.tokens })}
        </div>
      )}
      {note && <p style={s.hint}>{note}</p>}
      {!repoId && <p style={s.hint}>{t("editor.noRepo")}</p>}
      {repoId && isError && (
        <ErrorState body={error instanceof Error ? error.message : t("loadError")} onRetry={() => refetch()} />
      )}
      {list && list.length === 0 && (
        <div style={s.empty}>
          {t("empty.title")} — {t("empty.body", { folders })}
        </div>
      )}

      {sections.manual.length > 0 && (
        <div role="list" style={s.list}>
          {sections.manual.map((r) => (
            <DocRowItem key={r.path} {...rowProps(r, r.doc == null)} />
          ))}
        </div>
      )}
      {sections.groups.map((g) => (
        <section key={g.source}>
          <h3 style={s.groupHead}>{g.source}</h3>
          <div role="list" style={s.list}>
            {g.rows.map((r) => (
              <DocRowItem key={r.path} {...rowProps(r, false)} />
            ))}
          </div>
        </section>
      ))}
      {sections.notFound.length > 0 && (
        <div role="list" style={{ ...s.list, marginTop: 14 }}>
          {sections.notFound.map((r) => (
            <DocRowItem key={r.path} {...rowProps(r, true)} />
          ))}
        </div>
      )}

      <div style={s.footer}>
        <Button kind="primary" icon="Check" onClick={() => onSave(toPayload(draft))} disabled={saving}>
          {saving ? t("editor.saving") : t("editor.save")}
        </Button>
        <span style={s.total}>{t("editor.total", { count: sum })}</span>
        {sum > SOFT_CAP_TOKENS && (
          <Badge color="var(--warn)" bg="var(--warn-bg)">
            {t("editor.softCap")}
          </Badge>
        )}
      </div>

      {previewPath && (
        <PreviewDrawer
          repoId={repoId}
          path={previewPath}
          attached={draft.some((i) => i.path === previewPath)}
          onToggle={() => setDraft(toggle(draft, previewPath))}
          onClose={() => setPreviewPath(null)}
        />
      )}
    </div>
  );
}
