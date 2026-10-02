import { describe, it, expect } from "vitest";
import type { DownstreamImpact } from "@devdigest/shared";
import { layoutBlastGraph, truncateLabel } from "./helpers";

const ITEM: DownstreamImpact = {
  symbol: "A",
  callers: [
    { name: "h", file: "src/h.ts", line: 5, depth: 1 },
    { name: "k", file: "src/k.ts", line: 6, depth: 1 },
    { name: "route", file: "src/r.ts", line: 4, depth: 2, through: "h" },
  ],
  endpoints_affected: ["GET /x"],
  crons_affected: [],
};

/** Edges as "from -> to" over node LABELS (ids are an implementation detail). */
function edgeList(item: DownstreamImpact): string[] {
  const layout = layoutBlastGraph(item);
  const label = (id: string) => layout.nodes.find((n) => n.id === id)!.label;
  return layout.edges.map((e) => `${label(e.from)} -> ${label(e.to)}${e.dashed ? " (dashed)" : ""}`).sort();
}

describe("layoutBlastGraph", () => {
  it("lays out root, two direct callers, one indirect caller and one endpoint in 4 columns", () => {
    const layout = layoutBlastGraph(ITEM);
    expect(layout.nodes.map((n) => n.label).sort()).toEqual(["A", "GET /x", "h", "k", "route"]);
    expect(layout.columns).toBe(4);
    const col = (label: string) => layout.nodes.find((n) => n.label === label)!.column;
    expect([col("A"), col("h"), col("k"), col("route"), col("GET /x")]).toEqual([0, 1, 1, 2, 3]);
  });

  it("connects root→callers, the indirect caller to the caller it goes through, and root→endpoint dashed", () => {
    expect(edgeList(ITEM)).toEqual(
      ["A -> GET /x (dashed)", "A -> h", "A -> k", "h -> route"].sort(),
    );
  });

  it("an indirect caller whose `through` matches no direct caller hangs off the root", () => {
    const item: DownstreamImpact = {
      ...ITEM,
      callers: [
        { name: "h", file: "src/h.ts", line: 5, depth: 1 },
        { name: "route", file: "src/r.ts", line: 4, depth: 2, through: "gone" },
      ],
      endpoints_affected: [],
    };
    expect(edgeList(item)).toEqual(["A -> h", "A -> route"]);
  });

  it("without depth-2 callers there are 3 columns; without endpoints/crons, 2", () => {
    const noHop2: DownstreamImpact = { ...ITEM, callers: ITEM.callers.filter((c) => c.depth === 1) };
    expect(layoutBlastGraph(noHop2).columns).toBe(3);
    expect(layoutBlastGraph({ ...noHop2, endpoints_affected: [] }).columns).toBe(2);
  });

  it("a caller without a depth counts as a direct caller", () => {
    const item: DownstreamImpact = {
      symbol: "A",
      callers: [{ name: "h", file: "src/h.ts", line: 5 }],
      endpoints_affected: [],
      crons_affected: ["nightly"],
    };
    expect(edgeList(item)).toEqual(["A -> h", "A -> nightly (dashed)"]);
  });

  it("caller nodes carry file and line for the GitHub link; no node overlaps another in its column", () => {
    const layout = layoutBlastGraph(ITEM);
    expect(layout.nodes.find((n) => n.label === "h")).toMatchObject({ file: "src/h.ts", line: 5 });
    const ys = layout.nodes.filter((n) => n.column === 1).map((n) => n.y);
    expect(new Set(ys).size).toBe(ys.length);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });
});

describe("truncateLabel", () => {
  it("cuts to 18 characters ending in an ellipsis and leaves short labels alone", () => {
    const cut = truncateLabel("x".repeat(30));
    expect(cut).toHaveLength(18);
    expect(cut.endsWith("…")).toBe(true);
    expect(truncateLabel("y".repeat(18))).toBe("y".repeat(18));
    expect(truncateLabel("short")).toBe("short");
  });
});
