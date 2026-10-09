import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { blockerCount, latestVerdictReview } from "./helpers";

/** A-12 / A-33: the banner shows the first review with a verdict; blockers are undismissed CRITICAL. */

const review = (id: string, verdict: ReviewRecord["verdict"]): ReviewRecord => ({
  id,
  pr_id: "p1",
  agent_id: null,
  run_id: null,
  kind: "review",
  verdict,
  summary: null,
  score: null,
  model: null,
  created_at: "2026-10-09T00:00:00Z",
  findings: [],
});

const finding = (severity: FindingRecord["severity"], dismissed_at: string | null = null): FindingRecord => ({
  id: `${severity}-${dismissed_at}`,
  severity,
  category: "bug",
  title: "t",
  file: "a.ts",
  start_line: 1,
  end_line: 1,
  rationale: "r",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r",
  accepted_at: null,
  dismissed_at,
});

describe("latestVerdictReview", () => {
  it("is the first review with a verdict in the given order, skipping ones without", () => {
    const list = [review("none", null), review("first", "approve"), review("second", "request_changes")];
    expect(latestVerdictReview(list)?.id).toBe("first");
  });

  it("is undefined when no review has a verdict, or there are none", () => {
    expect(latestVerdictReview([review("a", null)])).toBeUndefined();
    expect(latestVerdictReview([])).toBeUndefined();
  });
});

describe("blockerCount", () => {
  it("counts CRITICAL findings that are not dismissed", () => {
    expect(
      blockerCount([
        finding("CRITICAL"),
        finding("CRITICAL", "2026-10-09T00:00:00Z"),
        finding("WARNING"),
        finding("SUGGESTION"),
      ]),
    ).toBe(1);
    expect(blockerCount([])).toBe(0);
  });
});
