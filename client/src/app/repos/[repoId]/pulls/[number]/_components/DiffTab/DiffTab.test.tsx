/**
 * DiffTab — the Files changed tab: the "N files · +A −D" counter and the Smart
 * order / Original order toggle, role groups (Core, Tests, Wiring, Docs,
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
      <DiffTab
        prId="pr1"
        filesCount={FILES.length}
        additions={120}
        deletions={7}
        files={FILES}
        canComment={false}
      />
    </NextIntlClientProvider>,
  );
}

const ROLE_RE = /^(Core|Tests|Wiring|Docs|Boilerplate)\b/;
const header = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label}\\b`) });
const UNAVAILABLE = "Smart grouping is unavailable — showing files in original order.";
const NO_REVIEW = "No review yet — findings will appear here after a review.";
const PATH_RE = /^(pnpm-lock\.yaml|README\.md|a\.test\.ts|b\.ts|a\.ts)$/;
/** File-card paths on screen, in DOM order. */
const shownPaths = () => screen.queryAllByText(PATH_RE).map((e) => e.textContent);
const orderButton = (name: "Smart order" | "Original order") =>
  within(screen.getByRole("group", { name: "File order" })).getByRole("button", { name });

beforeEach(() => {
  setSmart({ data: smartResponse() });
  h.reviews = [];
  h.mutate.mockReset();
});
afterEach(cleanup);

describe("DiffTab", () => {
  it("groups files by role in fixed order (Core and Tests open, Docs and Boilerplate collapsed), badges FILES with findings, and expands a collapsed group", () => {
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
    // a review exists, so no "No review yet" note
    expect(screen.queryByText(/No review yet/)).toBeNull();

    // Badge counts FILES with findings: two files carry five finding lines → 2, not 5.
    const core = header("Core");
    expect(within(core).getByLabelText("2 files with findings")).toBeInTheDocument();
    expect(within(core).getByText("● 2")).toBeInTheDocument();
    expect(within(core).getByText("2 files")).toBeInTheDocument();
    // ... and no badge at 0 findings.
    expect(within(header("Tests")).queryByLabelText(/files? with findings/)).toBeNull();
    expect(within(header("Tests")).queryByText(/●/)).toBeNull();

    // Q1: the badge stays on a COLLAPSED group.
    const docs = header("Docs");
    expect(within(docs).getByLabelText("1 file with findings")).toBeInTheDocument();
    expect(within(docs).getByText("● 1")).toBeInTheDocument();

    // Opening the collapsed group reveals its files; the badge stays.
    fireEvent.click(docs);
    expect(docs).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(within(docs).getByLabelText("1 file with findings")).toBeInTheDocument();

    // An open group keeps its badge when the user collapses it.
    fireEvent.click(core);
    expect(core).toHaveAttribute("aria-expanded", "false");
    expect(within(core).getByLabelText("2 files with findings")).toBeInTheDocument();
  });

  it("shows only findings of the reviews the smart-diff was built from, never dismissed ones, and Accept asks to accept that finding of this PR", () => {
    h.reviews = [
      review("R1", [finding("Old", { review_id: "R1" })]),
      review("R2", [finding("New"), finding("Gone", { dismissed_at: "2026-10-02T00:00:00Z" })]),
    ];
    renderTab();
    expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["New"]);
    expect(screen.queryByRole("article", { name: "Old" })).toBeNull();
    expect(screen.queryByRole("article", { name: "Gone" })).toBeNull();
    // the finding sits on a.ts, which therefore carries the file dot (comments are hidden by default)
    expect(screen.getAllByLabelText("Has findings")).toHaveLength(1);

    fireEvent.click(within(screen.getByRole("article", { name: "New" })).getByRole("button", { name: "Accept" }));
    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate).toHaveBeenCalledWith({ findingId: "New", action: "accept", prId: "pr1" });
  });

  it.each([
    {
      name: "smart-diff failed",
      state: () => setSmart({ data: undefined, isError: true }),
    },
    {
      name: "a failed refresh with stale data",
      state: () => setSmart({ data: smartResponse(), isError: true }),
    },
    {
      name: "smart-diff path set differs from the PR's files",
      state: () =>
        setSmart({
          data: smartResponse({
            groups: [{ role: "core", files: [{ path: "a.ts", additions: 3, deletions: 0, finding_lines: [] }] }],
          }),
        }),
    },
  ])("$name: flat list in original order with the notice, no group headers", ({ state }) => {
    state();
    renderTab();
    expect(screen.queryByRole("button", { name: ROLE_RE })).toBeNull();
    for (const p of PATHS) expect(screen.getByText(p)).toBeInTheDocument();
    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
  });

  it("while smart-diff loads: a loading status, no files, no headers, no notice", () => {
    setSmart({ data: undefined, isLoading: true });
    renderTab();
    expect(screen.getByRole("status", { name: "Loading the smart diff…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ROLE_RE })).toBeNull();
    for (const p of PATHS) expect(screen.queryByText(p)).toBeNull();
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
  });

  it("no review yet (review_ids = []): the 'No review yet' note is shown above the groups", () => {
    setSmart({ data: smartResponse({ review_ids: [] }) });
    renderTab();
    expect(screen.getByText(NO_REVIEW)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: ROLE_RE })).toHaveLength(4);
  });

  it("the toolbar shows the PR's file count and +/- totals, and Smart order is selected by default", () => {
    renderTab();
    expect(screen.getByText("5 files", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("+120")).toBeInTheDocument();
    expect(screen.getByText("−7")).toBeInTheDocument();
    expect(orderButton("Smart order")).toHaveAttribute("aria-pressed", "true");
    expect(orderButton("Original order")).toHaveAttribute("aria-pressed", "false");
  });

  it("Original order: no role groups, every file in the PR's own order, finding cards still under their line; Smart order brings the groups back", () => {
    h.reviews = [review("R2", [finding("New")])];
    renderTab();
    fireEvent.click(orderButton("Original order"));
    expect(orderButton("Original order")).toHaveAttribute("aria-pressed", "true");
    expect(orderButton("Smart order")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: ROLE_RE })).toBeNull();
    expect(shownPaths()).toEqual(PATHS);
    expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["New"]);
    expect(screen.getByRole("button", { name: "Blocker" })).toBeInTheDocument();

    fireEvent.click(orderButton("Smart order"));
    expect(screen.getAllByRole("button", { name: ROLE_RE })).toHaveLength(4);
    expect(shownPaths()).toEqual(["a.ts", "b.ts", "a.test.ts"]); // Docs and Boilerplate collapsed
    expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["New"]);
  });

  it("Original order does not wait for the smart diff and shows no 'unavailable' notice when it fails", () => {
    setSmart({ data: undefined, isLoading: true });
    const { rerender } = renderTab();
    fireEvent.click(orderButton("Original order"));
    expect(screen.queryByRole("status", { name: "Loading the smart diff…" })).toBeNull();
    expect(shownPaths()).toEqual(PATHS);

    setSmart({ data: undefined, isError: true });
    rerender(
      <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
        <DiffTab prId="pr1" filesCount={5} additions={120} deletions={7} files={FILES} canComment={false} />
      </NextIntlClientProvider>,
    );
    expect(shownPaths()).toEqual(PATHS);
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
  });

  it("the Smart-order fallback (path sets differ) still shows the finding cards of the latest review", () => {
    h.reviews = [review("R2", [finding("New")])];
    setSmart({
      data: smartResponse({
        groups: [{ role: "core", files: [{ path: "a.ts", additions: 3, deletions: 0, finding_lines: [2] }] }],
      }),
    });
    renderTab();
    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
    expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["New"]);
  });
});
