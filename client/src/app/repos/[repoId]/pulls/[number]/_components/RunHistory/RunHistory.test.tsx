/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: null,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function renderRuns(
  runs: RunSummary[],
  severityCounts?: Record<string, Record<string, number>>,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} severityCounts={severityCounts} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

describe("RunHistory — spend line", () => {
  it("a settled run shows its token total and cost", () => {
    renderRuns([run({ status: "done", tokens_in: 9000, tokens_out: 119, cost_usd: 0.0013 })]);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("an unknown cost degrades to tokens alone — never a $0.00 that reads as free", () => {
    renderRuns([run({ status: "done", tokens_in: 9000, tokens_out: 119, cost_usd: null })]);
    expect(screen.getByText("9,119 tok")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("a running run shows no spend at all (the numbers aren't final yet)", () => {
    renderRuns([run({ status: "running", tokens_in: 9000, tokens_out: 119, cost_usd: 0.0013 })]);
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});

/**
 * The timeline reports findings per severity, not as one total. The numbers do
 * not come from RunSummary (agent_runs has no per-severity column) — the PR
 * page tallies them from the reviews it already holds and passes them in, so
 * these cases pin both the counters and the fallback for when it cannot.
 */
describe("RunHistory — severity counters", () => {
  it("shows one counter per severity present, not a single total", () => {
    renderRuns([run({ status: "done", findings_count: 6, blockers: 0, score: 40 })], {
      "run-1": { CRITICAL: 2, WARNING: 1, SUGGESTION: 3 },
    });
    expect(screen.getByLabelText("2 CRITICAL")).toBeInTheDocument();
    expect(screen.getByLabelText("1 WARNING")).toBeInTheDocument();
    expect(screen.getByLabelText("3 SUGGESTION")).toBeInTheDocument();
    expect(screen.queryByText(/finding\(s\)/)).not.toBeInTheDocument();
  });

  it("omits the severities this run did not produce", () => {
    renderRuns([run({ status: "done", findings_count: 2, blockers: 2, score: 0 })], {
      "run-1": { CRITICAL: 2, WARNING: 0 },
    });
    expect(screen.getByLabelText("2 CRITICAL")).toBeInTheDocument();
    expect(screen.queryByLabelText(/WARNING/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/SUGGESTION/)).not.toBeInTheDocument();
  });

  it("keeps the blocker count beside the counters", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 2, score: 0 })], {
      "run-1": { CRITICAL: 2, WARNING: 1 },
    });
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
  });

  it("the counters sum to the run's own findings_count", () => {
    const counts = { CRITICAL: 2, WARNING: 1, SUGGESTION: 3 };
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    renderRuns([run({ status: "done", findings_count: total, blockers: 2, score: 12 })], {
      "run-1": counts,
    });
    for (const [sev, n] of Object.entries(counts)) {
      expect(screen.getByLabelText(`${n} ${sev}`)).toBeInTheDocument();
    }
    expect(total).toBe(6);
  });

  it("falls back to the aggregate when the breakdown is unknown — never a silent zero", () => {
    // A run whose review row was deleted: the page has no findings to tally,
    // but agent_runs still remembers how many there were.
    renderRuns([run({ status: "done", findings_count: 4, blockers: 0, score: 55 })], {
      "other-run": { CRITICAL: 1 },
    });
    expect(screen.getByText(/4 finding\(s\)/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/CRITICAL/)).not.toBeInTheDocument();
  });

  it("a clean run still reads '0 finding(s)', not an empty line", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })], {
      "run-1": {},
    });
    expect(screen.getByText(/0 finding\(s\)/)).toBeInTheDocument();
  });

  it("a failed run shows its error and no counters", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })], {
      "run-1": { CRITICAL: 2 },
    });
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.queryByLabelText(/CRITICAL/)).not.toBeInTheDocument();
  });
});
