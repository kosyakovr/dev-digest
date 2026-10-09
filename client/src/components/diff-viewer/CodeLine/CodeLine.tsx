/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { SEVERITY_LINE_LABEL_KEY } from "../constants";
import { worstSeverity, type DiffFindingApi } from "../findings";
import { InlineFinding } from "../InlineFinding";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor, findingStripeFor, findingLabelFor, targetLineStyle } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  findings = [],
  findingApi,
  highlighted,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** Findings anchored to this line, already sorted (see findings.ts). */
  findings?: FindingRecord[];
  findingApi?: DiffFindingApi;
  /** A deep link points at this row: mark and highlight it. */
  highlighted?: boolean;
}) {
  const t = useTranslations("shell");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);
  const [findingsOpen, setFindingsOpen] = React.useState(true);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const worst = findings.length > 0 ? worstSeverity(findings) : null;
  const WorstIcon = worst ? Icon[SEV[worst].icon] : null;

  return (
    <div
      style={cs.rowWrap}
      data-target-line={highlighted ? "true" : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        style={{
          ...lineRowFor(ln.kind),
          ...(highlighted ? targetLineStyle : {}),
          ...(worst ? findingStripeFor(SEV[worst].c) : {}),
        }}
      >
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {worst && WorstIcon && (
          <button
            type="button"
            aria-expanded={findingsOpen}
            onClick={() => setFindingsOpen((o) => !o)}
            style={findingLabelFor(SEV[worst].c, SEV[worst].bg, findingsOpen)}
          >
            <WorstIcon size={12} />
            {t(SEVERITY_LINE_LABEL_KEY[worst])}
          </button>
        )}
      </div>

      {findingApi &&
        findingsOpen &&
        findings.map((f) => (
          <InlineFinding
            key={f.id}
            f={f}
            pending={findingApi.pendingId === f.id}
            onAction={(action) => findingApi.onAction(f.id, action)}
          />
        ))}

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
