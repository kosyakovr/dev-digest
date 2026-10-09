/* DocRowItem — one doc row of the Context docs editor: drag handle, attach
   checkbox, path, source/tokens badges, preview and move buttons. All state
   lives in the editor; this component only renders and reports events. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Checkbox, Icon } from "@devdigest/ui";
import type { DocRow } from "@/lib/context-sections";
import { s } from "./styles";

export interface DocRowItemView {
  /** Show the "not found in <repo>" marker. */
  showNotFound: boolean;
  repoName: string;
  /** The row may be dragged and moved (attached, and the filter is empty). */
  canDrag: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  dragging: boolean;
}

export interface DocRowItemHandlers {
  dragStart: () => void;
  dragEnd: () => void;
  dragOver: (e: React.DragEvent) => void;
  drop: () => void;
  toggle: () => void;
  preview: () => void;
  moveUp: () => void;
  moveDown: () => void;
}

export interface DocRowItemProps {
  row: DocRow;
  view: DocRowItemView;
  on: DocRowItemHandlers;
}

export function DocRowItem({ row: r, view, on }: DocRowItemProps) {
  const { showNotFound, repoName, canDrag, canMoveUp, canMoveDown, dragging } = view;
  const {
    dragStart: onDragStart,
    dragEnd: onDragEnd,
    dragOver: onDragOver,
    drop: onDrop,
    toggle: onToggle,
    preview: onPreview,
    moveUp: onMoveUp,
    moveDown: onMoveDown,
  } = on;
  const t = useTranslations("context");
  return (
    <div
      role="listitem"
      aria-label={r.path}
      draggable={canDrag}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={s.row(r.attached, dragging)}
    >
      <span style={s.handle(canDrag)} aria-hidden="true">
        <Icon.Menu size={14} />
      </span>
      <Checkbox
        checked={r.attached}
        onChange={onToggle}
        label={<span style={s.hidden}>{t("editor.attach", { path: r.path })}</span>}
      />
      <span className="mono" style={s.path}>
        {r.path}
      </span>
      {showNotFound && <span style={s.notFound}>{t("editor.notFound", { repo: repoName })}</span>}
      {r.doc?.source && <Badge mono>{r.doc.source}</Badge>}
      {r.doc?.tokens != null && <span style={s.tokens}>{t("tokens", { count: r.doc.tokens })}</span>}
      {r.doc && (
        <Button kind="ghost" size="sm" icon="Eye" onClick={onPreview}>
          {t("editor.preview")}
        </Button>
      )}
      {canDrag && (
        <span style={s.moveGroup}>
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            aria-label={t("editor.moveUp", { path: r.path })}
            style={s.moveBtn(!canMoveUp)}
          >
            <Icon.ArrowUp size={13} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            aria-label={t("editor.moveDown", { path: r.path })}
            style={s.moveBtn(!canMoveDown)}
          >
            <Icon.ArrowDown size={13} />
          </button>
        </span>
      )}
    </div>
  );
}
