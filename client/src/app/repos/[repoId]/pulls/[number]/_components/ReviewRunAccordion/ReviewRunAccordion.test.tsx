/**
 * ReviewRunAccordion — one run's card in the "Review runs" section.
 *
 * Pins the layout the acceptance criteria describe: expanding a run shows the
 * verdict and PR SCORE, then the severity counters and filters, then the
 * finding cards — and it is HERE, not in the PR list popover or the trace
 * drawer, that a finding can be accepted or dismissed.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

// Same specifier depth the component itself uses, or the real hooks run and
// demand a QueryClient.
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ReviewRunAccordion } from "./ReviewRunAccordion";

function finding(o: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "security",
    title: `Finding ${o.id}`,
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

const REVIEW: ReviewRecord = {
  id: "rv1",
  pr_id: "pr1",
  agent_id: "a1",
  run_id: "run1",
  agent_name: "Security Reviewer",
  kind: "review",
  verdict: "request_changes",
  summary: "Hardcoded Stripe secret introduced.",
  score: 38,
  model: "deepseek-v4-flash",
  grounding: "2/2 passed",
  created_at: "2026-06-11T20:52:51.000Z",
  findings: [
    finding({ id: "f1", title: "Hardcoded secret" }),
    finding({ id: "f2", severity: "WARNING", category: "perf", title: "N+1 query" }),
  ],
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("ReviewRunAccordion", () => {
  it("keeps the run collapsed until it is clicked", () => {
    renderWithIntl(<ReviewRunAccordion review={REVIEW} prId="pr1" />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it("expands to the verdict, PR SCORE, severity counters and filters, then the findings", () => {
    const { container } = renderWithIntl(<ReviewRunAccordion review={REVIEW} prId="pr1" />);
    fireEvent.click(screen.getByText("Security Reviewer"));

    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("PR SCORE")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Filter by severity" })).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();

    // Order matters: the counters sit under the verdict banner and above the
    // finding cards, which is what the acceptance criteria describe.
    const banner = screen.getByText("PR SCORE");
    const counters = screen.getByLabelText("Severity counts");
    const firstCard = container.querySelector("[data-finding-id]")!;
    expect(banner.compareDocumentPosition(counters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(counters.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("is the surface that offers Accept / Dismiss on a finding", () => {
    renderWithIntl(<ReviewRunAccordion review={REVIEW} prId="pr1" defaultOpen />);
    // The first card starts expanded, so its actions are reachable.
    expect(screen.getByRole("button", { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
  });

  it("filters this run's findings without collapsing the run", () => {
    renderWithIntl(<ReviewRunAccordion review={REVIEW} prId="pr1" defaultOpen />);
    fireEvent.click(screen.getByRole("button", { name: "Warning" }));

    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    // Still expanded — the filter is a view of the run, not a navigation.
    expect(screen.getByText("PR SCORE")).toBeInTheDocument();
  });
});
