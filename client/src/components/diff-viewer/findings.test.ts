import { describe, it, expect } from "vitest";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { sortFindings, worstSeverity, partitionFindings, findingsForLine } from "./findings";

function f(id: string, severity: Severity, start_line: number, end_line = start_line): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: `Finding ${id}`,
    file: "src/a.ts",
    start_line,
    end_line,
    rationale: "because",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

describe("sortFindings", () => {
  it("orders by severity (CRITICAL first), then start_line, end_line, id", () => {
    const list = [f("b", "WARNING", 2), f("c", "CRITICAL", 2), f("a", "CRITICAL", 2), f("s", "SUGGESTION", 50)];
    expect(sortFindings(list).map((x) => x.id)).toEqual(["a", "c", "b", "s"]);
  });

  it("breaks a severity tie by start_line, then end_line, and does not mutate its input", () => {
    const list = [f("x", "WARNING", 9, 9), f("y", "WARNING", 3, 8), f("z", "WARNING", 3, 4)];
    const before = list.map((x) => x.id);
    expect(sortFindings(list).map((x) => x.id)).toEqual(["z", "y", "x"]);
    expect(list.map((x) => x.id)).toEqual(before);
  });
});

describe("worstSeverity", () => {
  it("returns the most severe severity of the list", () => {
    expect(worstSeverity([f("w", "WARNING", 1), f("s", "SUGGESTION", 1)])).toBe("WARNING");
    expect(worstSeverity([f("s", "SUGGESTION", 1), f("c", "CRITICAL", 1), f("w", "WARNING", 1)])).toBe("CRITICAL");
  });
});

describe("findingsForLine", () => {
  const onLine2 = [f("a", "CRITICAL", 2), f("b", "WARNING", 2)];
  const matched = new Map([["RIGHT:2", onLine2]]);

  it("returns the findings of the new-side line number for add and context lines", () => {
    expect(findingsForLine({ kind: "add", text: "x", newNo: 2 }, matched)).toEqual(onLine2);
    expect(findingsForLine({ kind: "ctx", text: "x", oldNo: 1, newNo: 2 }, matched)).toEqual(onLine2);
  });

  it("returns [] for deleted and hunk lines, even when their numbers collide with a finding", () => {
    expect(findingsForLine({ kind: "del", text: "x", oldNo: 2, newNo: 2 }, matched)).toEqual([]);
    expect(findingsForLine({ kind: "hunk", text: "@@ -1,2 +1,3 @@", oldNo: 2, newNo: 2 }, matched)).toEqual([]);
  });

  it("returns [] for a line nothing is anchored to", () => {
    expect(findingsForLine({ kind: "add", text: "x", newNo: 3 }, matched)).toEqual([]);
    expect(findingsForLine({ kind: "add", text: "x", newNo: 2 }, new Map())).toEqual([]);
  });
});

describe("partitionFindings", () => {
  it("splits findings into those on a rendered line (sorted) and those outside the diff", () => {
    const list = [
      f("b", "WARNING", 2),
      f("c", "CRITICAL", 2),
      f("a", "CRITICAL", 2),
      f("s", "SUGGESTION", 50),
    ];
    const { matched, outside } = partitionFindings(list, new Set(["RIGHT:1", "RIGHT:2", "RIGHT:3"]));
    expect([...matched.keys()]).toEqual(["RIGHT:2"]);
    expect(matched.get("RIGHT:2")!.map((x) => x.id)).toEqual(["a", "c", "b"]);
    expect(outside.map((x) => x.id)).toEqual(["s"]);
  });

  it("anchors only on the new (RIGHT) side: a LEFT-only key does not match", () => {
    const { matched, outside } = partitionFindings([f("a", "WARNING", 2)], new Set(["LEFT:2"]));
    expect(matched.size).toBe(0);
    expect(outside.map((x) => x.id)).toEqual(["a"]);
  });
});
