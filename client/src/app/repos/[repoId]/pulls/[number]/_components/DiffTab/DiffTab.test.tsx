/**
 * DiffTab — the Files changed tab: role groups (Core, Tests, Wiring, Docs,
 * Boilerplate) from the smart-diff endpoint, findings of the latest review set
 * inline, and the flat fallback when the grouping is unavailable.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import shell from "../../../../../../../../messages/en/shell.json";
import prReview from "../../../../../../../../messages/en/prReview.json";

interface SmartState {
  data: SmartDiffResponse | undefined;
  isLoading: boolean;
  isError: boolean;
}
const h = vi.hoisted(() => ({
  smart: undefined as unknown as { data: unknown; isLoading: boolean; isError: boolean },
  reviews: undefined as unknown,
  mutate: vi.fn(),
}));

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ isPending: false, mutateAsync: vi.fn() }),
  usePrReviews: () => ({ data: h.reviews }),
  useSmartDiff: () => h.smart,
  useFindingAction: () => ({ mutate: h.mutate, isPending: false, variables: undefined }),
}));

import { DiffTab } from "./DiffTab";

const PATCH = "@@ -1,2 +1,3 @@\n ctx\n+added\n ctx2"; // new lines 1, 2 (add), 3
const mk = (path: string, patch: string | null = PATCH): PrFile => ({ path, additions: 3, deletions: 0, patch });
const FILES: PrFile[] = [
  mk("pnpm-lock.yaml"),
  mk("README.md"),
  mk("a.test.ts"),
  mk("b.ts"),
  mk("a.ts"),
];
const PATHS = FILES.map((f) => f.path);

function smartResponse(over: Partial<SmartDiffResponse> = {}): SmartDiffResponse {
  const file = (path: string, finding_lines: number[]) => ({ path, additions: 3, deletions: 0, finding_lines });
  return {
    groups: [
      { role: "core", files: [file("a.ts", [3, 7, 9]), file("b.ts", [1, 2])] },
      { role: "tests", files: [file("a.test.ts", [])] },
      { role: "docs", files: [file("README.md", [1])] },
      { role: "boilerplate", files: [file("pnpm-lock.yaml", [])] },
    ],
    split_suggestion: { too_big: false, total_lines: 15, proposed_splits: [] },
    review_ids: ["R2"],
    ...over,
  };
}

function finding(id: string, over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id,
    severity: "CRITICAL",
    category: "bug",
    title: id,
    file: "a.ts",
    start_line: 2,
    end_line: 2,
    rationale: `Rationale of ${id}`,
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "R2",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

function review(id: string, findings: FindingRecord[]): ReviewRecord {
  return {
    id,
    pr_id: "pr1",
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

function setSmart(s: Partial<SmartState>) {
  h.smart = { data: undefined, isLoading: false, isError: false, ...s };
}

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
      <DiffTab prId="pr1" filesCount={FILES.length} files={FILES} canComment={false} />
    </NextIntlClientProvider>,
  );
}

const ROLE_RE = /^(Core|Tests|Wiring|Docs|Boilerplate)\b/;
const header = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label}\\b`) });
const UNAVAILABLE = "Smart grouping is unavailable — showing files in original order.";

beforeEach(() => {
  setSmart({ data: smartResponse() });
  h.reviews = [];
  h.mutate.mockReset();
});
afterEach(cleanup);

describe("DiffTab role groups", () => {
  it("shows the groups in fixed order; Core and Tests open, Docs and Boilerplate collapsed", () => {
    renderTab();
    const headers = screen
      .getAllByRole("button", { name: ROLE_RE })
      .map((b) => b.textContent!.match(/Core|Tests|Wiring|Docs|Boilerplate/)![0]);
    expect(headers).toEqual(["Core", "Tests", "Docs", "Boilerplate"]);

    expect(header("Core")).toHaveAttribute("aria-expanded", "true");
    expect(header("Tests")).toHaveAttribute("aria-expanded", "true");
    expect(header("Docs")).toHaveAttribute("aria-expanded", "false");
    expect(header("Boilerplate")).toHaveAttribute("aria-expanded", "false");

    expect(screen.getByText("a.ts")).toBeInTheDocument();
    expect(screen.getByText("b.ts")).toBeInTheDocument();
    expect(screen.getByText("a.test.ts")).toBeInTheDocument();
    expect(screen.queryByText("README.md")).toBeNull();
    expect(screen.queryByText("pnpm-lock.yaml")).toBeNull();
  });

  it("opening a collapsed group reveals its files", () => {
    renderTab();
    fireEvent.click(header("Docs"));
    expect(header("Docs")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("README.md")).toBeInTheDocument();
  });

  it("the header badge counts FILES with findings (2 files / 5 lines → 2), open or collapsed, and is absent at 0", () => {
    renderTab();
    const core = header("Core");
    // two files carry five finding lines between them — the badge says 2, not 5
    expect(within(core).getByLabelText("2 files with findings")).toBeInTheDocument();
    expect(within(core).getByText("● 2")).toBeInTheDocument();
    expect(within(core).getByText("2 files")).toBeInTheDocument();

    expect(within(header("Tests")).queryByLabelText(/files? with findings/)).toBeNull();
    expect(within(header("Tests")).queryByText(/●/)).toBeNull();

    // Q1: the badge stays on a COLLAPSED group
    const docs = header("Docs");
    expect(docs).toHaveAttribute("aria-expanded", "false");
    expect(within(docs).getByLabelText("1 file with findings")).toBeInTheDocument();
    expect(within(docs).getByText("● 1")).toBeInTheDocument();

    // ... and on an open group it does not vanish when the group is collapsed by the user
    fireEvent.click(core);
    expect(core).toHaveAttribute("aria-expanded", "false");
    expect(within(core).getByLabelText("2 files with findings")).toBeInTheDocument();
  });
});

describe("DiffTab states", () => {
  it("smart-diff failed: every file in the original flat list, no group headers, with the notice", () => {
    setSmart({ data: undefined, isError: true });
    renderTab();
    expect(screen.queryByRole("button", { name: ROLE_RE })).toBeNull();
    for (const p of PATHS) expect(screen.getByText(p)).toBeInTheDocument();
    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
  });

  it("a failed refresh with stale data still counts as failed: flat list with the notice, no groups", () => {
    setSmart({ data: smartResponse(), isError: true });
    renderTab();
    expect(screen.queryByRole("button", { name: ROLE_RE })).toBeNull();
    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
  });

  it("smart-diff path set differs from the PR's files: same flat fallback", () => {
    const stale = smartResponse({
      groups: [{ role: "core", files: [{ path: "a.ts", additions: 3, deletions: 0, finding_lines: [] }] }],
    });
    setSmart({ data: stale });
    renderTab();
    expect(screen.queryByRole("button", { name: ROLE_RE })).toBeNull();
    for (const p of PATHS) expect(screen.getByText(p)).toBeInTheDocument();
    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
  });

  it("while smart-diff loads no file is shown yet and no notice is raised", () => {
    setSmart({ data: undefined, isLoading: true });
    renderTab();
    for (const p of PATHS) expect(screen.queryByText(p)).toBeNull();
    expect(screen.queryByRole("button", { name: ROLE_RE })).toBeNull();
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
  });

  it("no review yet: the 'No review yet' note is shown; with a review it is not", () => {
    setSmart({ data: smartResponse({ review_ids: [] }) });
    renderTab();
    expect(
      screen.getByText("No review yet — findings will appear here after a review."),
    ).toBeInTheDocument();
    cleanup();
    setSmart({ data: smartResponse() });
    renderTab();
    expect(screen.queryByText(/No review yet/)).toBeNull();
  });
});

describe("DiffTab findings", () => {
  it("shows only findings of the reviews the smart-diff was built from, and never dismissed ones", () => {
    h.reviews = [
      review("R1", [finding("Old", { review_id: "R1" })]),
      review("R2", [finding("New"), finding("Gone", { dismissed_at: "2026-10-02T00:00:00Z" })]),
    ];
    renderTab();
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.queryByText("Old")).toBeNull();
    expect(screen.queryByText("Gone")).toBeNull();
    // the finding sits on a.ts, which therefore carries the file dot (comments are hidden by default)
    expect(screen.getAllByLabelText("Has findings")).toHaveLength(1);
  });

  it("Accept on a card asks to accept that finding of this PR", () => {
    h.reviews = [review("R2", [finding("New")])];
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate).toHaveBeenCalledWith({ findingId: "New", action: "accept", prId: "pr1" });
  });
});
