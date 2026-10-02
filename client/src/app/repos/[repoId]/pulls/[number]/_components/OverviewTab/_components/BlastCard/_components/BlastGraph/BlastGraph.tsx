/* BlastGraph — a hand-rolled SVG of ONE changed symbol at a time: the symbol,
   its direct and indirect callers, and the endpoints/crons its callers reach.
   Endpoint/cron edges leave the root dashed: the contract does not tie an
   endpoint to a specific caller. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { DownstreamImpact } from "@devdigest/shared";
import { callerHref } from "../../helpers";
import { layoutBlastGraph, NODE_H, NODE_W, truncateLabel, type GraphNode, type GraphNodeKind } from "./helpers";

const FILL: Record<GraphNodeKind, string> = {
  root: "var(--accent)",
  caller: "var(--bg-hover)",
  indirect: "var(--bg-elevated)",
  endpoint: "var(--bg-hover)",
  cron: "var(--bg-hover)",
};
const TEXT: Record<GraphNodeKind, string> = {
  root: "var(--bg-base, #fff)",
  caller: "var(--text-primary)",
  indirect: "var(--text-secondary)",
  endpoint: "var(--text-primary)",
  cron: "var(--text-primary)",
};

interface LinkProps {
  repoFullName: string | null | undefined;
  sha: string | null;
}

function GraphNodeView({ node, repoFullName, sha }: LinkProps & { node: GraphNode }) {
  const body = (
    <g>
      <title>{node.label}</title>
      <rect
        x={node.x}
        y={node.y}
        width={NODE_W}
        height={NODE_H}
        rx={6}
        fill={FILL[node.kind]}
        stroke="var(--border)"
      />
      <text x={node.x + 10} y={node.y + NODE_H / 2 + 4} fontSize={12} fill={TEXT[node.kind]}>
        {truncateLabel(node.label)}
      </text>
    </g>
  );
  const href =
    node.file !== undefined && node.line !== undefined
      ? callerHref(repoFullName, sha, { file: node.file, line: node.line })
      : null;
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  ) : (
    body
  );
}

const LEGEND = ["changed", "callers", "indirect", "impact"] as const;
const LEGEND_KIND: Record<(typeof LEGEND)[number], GraphNodeKind> = {
  changed: "root",
  callers: "caller",
  indirect: "indirect",
  impact: "endpoint",
};

export function BlastGraph({
  downstream,
  repoFullName,
  sha,
}: LinkProps & { downstream: DownstreamImpact[] }) {
  const t = useTranslations("blast");
  const [picked, setPicked] = React.useState(0);
  const item = downstream[picked] ?? downstream[0];
  if (!item) return <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("graph.empty")}</div>;

  const layout = layoutBlastGraph(item);
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("graph.symbolPicker")}</span>
        {downstream.map((d, i) => (
          <button
            key={d.symbol}
            type="button"
            className="mono"
            aria-pressed={i === picked}
            onClick={() => setPicked(i)}
            style={{
              fontSize: 12,
              padding: "2px 8px",
              borderRadius: 5,
              border: "1px solid var(--border)",
              cursor: "pointer",
              background: i === picked ? "var(--bg-hover)" : "transparent",
              color: "var(--text-primary)",
            }}
          >
            {d.symbol}
          </button>
        ))}
      </div>
      <div style={{ overflowX: "auto", minWidth: 0 }}>
        <svg
          role="img"
          aria-label={t("graph.ariaLabel")}
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
        >
          {layout.edges.map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            return (
              <line
                key={`${e.from}>${e.to}`}
                x1={a.x + NODE_W}
                y1={a.y + NODE_H / 2}
                x2={b.x}
                y2={b.y + NODE_H / 2}
                stroke="var(--text-muted)"
                strokeWidth={1}
                strokeDasharray={e.dashed ? "4 3" : undefined}
              />
            );
          })}
          {layout.nodes.map((n) => (
            <GraphNodeView key={n.id} node={n} repoFullName={repoFullName} sha={sha} />
          ))}
        </svg>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: "var(--text-muted)" }}>
        {LEGEND.map((k) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: FILL[LEGEND_KIND[k]],
                border: "1px solid var(--border)",
              }}
            />
            {t(`graph.legend.${k}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
