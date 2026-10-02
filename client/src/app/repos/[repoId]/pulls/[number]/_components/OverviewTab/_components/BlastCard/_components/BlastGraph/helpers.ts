/* BlastGraph layout — pure: one symbol's impact → positioned nodes and edges. */
import type { DownstreamImpact } from "@devdigest/shared";

export type GraphNodeKind = "root" | "caller" | "indirect" | "endpoint" | "cron";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  x: number;
  y: number;
  column: number;
  /** Set on caller nodes so the view can build the GitHub link. */
  file?: string;
  line?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  dashed: boolean;
}

export interface GraphLayout {
  width: number;
  height: number;
  columns: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const NODE_W = 150;
export const NODE_H = 28;
const COL_GAP = 40;
const ROW_GAP = 12;
const PAD = 12;
const LABEL_MAX = 18;

/** Cut a label to 18 characters, ending in an ellipsis. */
export function truncateLabel(label: string): string {
  return label.length > LABEL_MAX ? `${label.slice(0, LABEL_MAX - 1)}…` : label;
}

export function layoutBlastGraph(item: DownstreamImpact): GraphLayout {
  const direct = item.callers.filter((c) => (c.depth ?? 1) === 1);
  const indirect = item.callers.filter((c) => (c.depth ?? 1) >= 2);

  const root: Omit<GraphNode, "x" | "y" | "column"> = { id: "root", kind: "root", label: item.symbol };
  const d1 = direct.map((c, i) => ({
    id: `d1:${i}`, kind: "caller" as const, label: c.name, file: c.file, line: c.line,
  }));
  const d2 = indirect.map((c, i) => ({
    id: `d2:${i}`, kind: "indirect" as const, label: c.name, file: c.file, line: c.line,
  }));
  const impact = [
    ...item.endpoints_affected.map((e, i) => ({ id: `e:${i}`, kind: "endpoint" as const, label: e })),
    ...item.crons_affected.map((k, i) => ({ id: `k:${i}`, kind: "cron" as const, label: k })),
  ];

  const cols = [[root], d1, ...(d2.length > 0 ? [d2] : []), ...(impact.length > 0 ? [impact] : [])];
  const maxRows = Math.max(...cols.map((c) => c.length));
  const innerH = maxRows * NODE_H + (maxRows - 1) * ROW_GAP;

  const nodes: GraphNode[] = [];
  cols.forEach((col, ci) => {
    const colH = col.length * NODE_H + (col.length - 1) * ROW_GAP;
    const top = PAD + (innerH - colH) / 2;
    col.forEach((n, ri) => {
      nodes.push({ ...n, x: PAD + ci * (NODE_W + COL_GAP), y: top + ri * (NODE_H + ROW_GAP), column: ci });
    });
  });

  const edges: GraphEdge[] = [];
  d1.forEach((n) => edges.push({ from: "root", to: n.id, dashed: false }));
  indirect.forEach((c, i) => {
    const parent = d1.find((n) => n.label === c.through);
    edges.push({ from: parent?.id ?? "root", to: d2[i]!.id, dashed: false });
  });
  impact.forEach((n) => edges.push({ from: "root", to: n.id, dashed: true }));

  return {
    width: PAD * 2 + cols.length * NODE_W + (cols.length - 1) * COL_GAP,
    height: PAD * 2 + innerH,
    columns: cols.length,
    nodes,
    edges,
  };
}
