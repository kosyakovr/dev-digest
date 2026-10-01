import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import { planGroups, visibleFindings } from "./helpers";

const file = (path: string): PrFile => ({ path, additions: 1, deletions: 0, patch: null });

function smart(groups: Array<[SmartDiffResponse["groups"][number]["role"], Array<[string, number[]]>]>): SmartDiffResponse {
  return {
    groups: groups.map(([role, files]) => ({
      role,
      files: files.map(([path, finding_lines]) => ({ path, additions: 1, deletions: 0, finding_lines })),
    })),
    split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
    review_ids: [],
  };
}

describe("planGroups", () => {
  it("joins the server grouping with the PR's files, in the smart-diff order", () => {
    const a = file("a");
    const b = file("b");
    // PR files arrive in a different order than the smart-diff lists them.
    const plan = planGroups(smart([["core", [["a", []]]], ["tests", [["b", []]]]]), [b, a]);
    expect(plan).not.toBeNull();
    expect(plan!.map((g) => g.role)).toEqual(["core", "tests"]);
    expect(plan![0]!.files).toEqual([a]);
    expect(plan![1]!.files).toEqual([b]);
  });

  it("counts FILES with findings per group, not finding lines", () => {
    const plan = planGroups(
      smart([["core", [["a.ts", [3, 7, 9]], ["b.ts", [1, 2]], ["c.ts", []]]]]),
      [file("a.ts"), file("b.ts"), file("c.ts")],
    );
    expect(plan![0]!.filesWithFindings).toBe(2);
  });

  it("returns null when the PR has a file the smart-diff does not know", () => {
    expect(planGroups(smart([["core", [["a", []], ["b", []]]]]), [file("a"), file("b"), file("c")])).toBeNull();
  });

  it("returns null when the smart-diff lists a file the PR no longer has", () => {
    expect(planGroups(smart([["core", [["a", []], ["b", []]]]]), [file("a"), file("c")])).toBeNull();
  });

  it("returns null when a path is listed twice, even if the counts add up", () => {
    expect(planGroups(smart([["core", [["a", []]]], ["docs", [["a", []]]]]), [file("a"), file("b")])).toBeNull();
  });
});

function finding(id: string, dismissed_at: string | null = null): FindingRecord {
  return {
    id,
    severity: "WARNING",
    category: "bug",
    title: id,
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "x",
    accepted_at: null,
    dismissed_at,
  };
}

function review(id: string, findings: FindingRecord[]): ReviewRecord {
  return {
    id,
    pr_id: "p",
    agent_id: null,
    run_id: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-10-01T00:00:00Z",
    findings,
  };
}

describe("visibleFindings", () => {
  const reviews = [review("R1", [finding("f1")]), review("R2", [finding("f2", "2026-10-02T00:00:00Z"), finding("f3")])];

  it("keeps only reviews of the smart-diff's set and drops dismissed findings", () => {
    expect(visibleFindings(reviews, ["R2"]).map((f) => f.id)).toEqual(["f3"]);
  });

  it("takes every review of a multi-agent set", () => {
    expect(visibleFindings(reviews, ["R1", "R2"]).map((f) => f.id)).toEqual(["f1", "f3"]);
  });

  it("is empty when there are no review ids or the reviews have not loaded", () => {
    expect(visibleFindings(reviews, [])).toEqual([]);
    expect(visibleFindings(undefined, ["R1"])).toEqual([]);
  });
});
