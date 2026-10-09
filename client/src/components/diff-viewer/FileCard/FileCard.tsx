/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type DiffTarget, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { findingsForLine, partitionFindings, type DiffFindingApi } from "../findings";
import {
  s,
  chevronFor,
  outsideStyles,
  targetPulseKeyframes,
  TARGET_PULSE_DURATION_MS,
} from "../styles";
import { InlineFinding } from "../InlineFinding";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  findings,
  target,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
  /** Set on the card a deep link points at: starts open, scrolls, takes focus. */
  target?: DiffTarget | null;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    !!target || (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const headerRef = React.useRef<HTMLDivElement>(null);

  // The one row the link points at: an added or context line with that new-side number.
  const targetIndex = React.useMemo(() => {
    const line = target?.line;
    if (line == null) return -1;
    return lines.findIndex((ln) => (ln.kind === "add" || ln.kind === "ctx") && ln.newNo === line);
  }, [lines, target?.line]);

  // Synchronise with the DOM on mount: bring the target row (or, when that line
  // is not rendered, the card) into view and move focus to the header.
  React.useEffect(() => {
    if (!target) return;
    headerRef.current?.focus({ preventScroll: true });
    const row = cardRef.current?.querySelector('[data-target-line="true"]');
    (row ?? cardRef.current)?.scrollIntoView?.({ block: "center" });
    // Pulse the row once; the static highlight stays as the resting state.
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (row && !reduceMotion) {
      row.animate?.(targetPulseKeyframes, { duration: TARGET_PULSE_DURATION_MS, easing: "ease-out" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const renderedKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) keys.add(k);
    return keys;
  }, [lines]);
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, renderedKeys]);

  // Findings of the latest review for this file, anchored on the same rendered
  // keys as threads; the rest are listed on top so none is silently dropped.
  const allFindings = findings?.findings;
  const { matchedFindings, outsideFindings, hasFindings } = React.useMemo(() => {
    const fileFindings = (allFindings ?? []).filter((f) => f.file === file.path);
    const { matched, outside } = partitionFindings(fileFindings, renderedKeys);
    return { matchedFindings: matched, outsideFindings: outside, hasFindings: fileFindings.length > 0 };
  }, [allFindings, file.path, renderedKeys]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div ref={cardRef} style={s.fileCard}>
      <div ref={headerRef} tabIndex={target ? -1 : undefined} onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {hasFindings && (
          <span
            role="img"
            aria-label={t("diffViewer.fileHasFindings")}
            style={{ width: 6, height: 6, borderRadius: "50%", background: SEV.CRITICAL.c, flexShrink: 0 }}
          />
        )}
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {findings && outsideFindings.length > 0 && (
            <div
              role="region"
              aria-label={t("diffViewer.findingsOutsideDiff")}
              style={outsideStyles.wrap}
            >
              <div style={outsideStyles.heading}>{t("diffViewer.findingsOutsideDiff")}</div>
              {outsideFindings.map((f) => (
                <div key={f.id} style={outsideStyles.item}>
                  <InlineFinding
                    f={f}
                    pending={findings.pendingId === f.id}
                    onAction={(action) => findings.onAction(f.id, action)}
                  />
                </div>
              ))}
            </div>
          )}
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                findings={findingsForLine(ln, matchedFindings)}
                findingApi={findings}
                highlighted={i === targetIndex}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
