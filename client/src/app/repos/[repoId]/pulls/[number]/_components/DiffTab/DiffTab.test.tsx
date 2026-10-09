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

/** PR-level file count — deliberately NOT FILES.length, so the toolbar provably reads it. */
const FILES_COUNT = 12;

function tab() {
  return (
    <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
      <DiffTab
        prId="pr1"
        filesCount={FILES_COUNT}
        additions={120}
        deletions={7}
        files={FILES}
        canComment={false}
      />
    </NextIntlClientProvider>
  );
}

function renderTab() {
  return render(tab());
}

const ROLE_RE = /^(Core|Tests|Wiring|Docs|Boilerplate)\b/;
const header = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label}\\b`) });
const UNAVAILABLE = "Smart grouping is unavailable — showing files in original order.";
const NO_REVIEW = "No review yet — findings will appear here after a review.";
const FINDINGS_UNAVAILABLE = "Review findings are unavailable right now — showing the diff without them.";
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
      findingsNote: true,
    },
    {
      name: "a failed refresh with stale data",
      state: () => setSmart({ data: smartResponse(), isError: true }),
      findingsNote: false,
    },
    {
      name: "smart-diff path set differs from the PR's files",
      state: () =>
        setSmart({
          data: smartResponse({
            groups: [{ role: "core", files: [{ path: "a.ts", additions: 3, deletions: 0, finding_lines: [] }] }],
          }),
        }),
      findingsNote: false,
    },
  ])("$name: flat list in original order with the notice, no group headers", ({ state, findingsNote }) => {
    state();
    renderTab();
    expect(screen.queryByRole("button", { name: ROLE_RE })).toBeNull();
    for (const p of PATHS) expect(screen.getByText(p)).toBeInTheDocument();
    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
    // findings come from the smart diff's review_ids: say so only when there is no data at all
    expect(!!screen.queryByText(FINDINGS_UNAVAILABLE)).toBe(findingsNote);
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
    expect(screen.getByText("12 files", { exact: false })).toBeInTheDocument();
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

  it("Original order: files do not wait for the smart diff; cards appear once it loads; a failure with no data says findings are unavailable; stale data keeps its cards", () => {
    h.reviews = [review("R2", [finding("New")])];
    const cards = () => screen.queryAllByRole("article").map((a) => a.getAttribute("aria-label"));

    setSmart({ data: undefined, isLoading: true });
    const { rerender } = renderTab();
    fireEvent.click(orderButton("Original order"));
    expect(screen.queryByRole("status", { name: "Loading the smart diff…" })).toBeNull();
    expect(shownPaths()).toEqual(PATHS);
    expect(cards()).toEqual([]); // no review_ids yet
    expect(screen.queryByText(FINDINGS_UNAVAILABLE)).toBeNull();

    setSmart({ data: smartResponse() });
    rerender(tab());
    expect(cards()).toEqual(["New"]);
    expect(screen.queryByText(FINDINGS_UNAVAILABLE)).toBeNull();

    setSmart({ data: undefined, isError: true });
    rerender(tab());
    expect(shownPaths()).toEqual(PATHS);
    expect(cards()).toEqual([]);
    expect(screen.getByText(FINDINGS_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();

    setSmart({ data: smartResponse(), isError: true }); // failed refresh, stale data kept
    rerender(tab());
    expect(cards()).toEqual(["New"]);
    expect(screen.queryByText(FINDINGS_UNAVAILABLE)).toBeNull();
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

/**
 * Deep-link target from the Risk Brief (plan docs/plans/L05-risk-brief.md,
 * WP9.tests [T1]; spec AC-34, AC-35). A `target` opens the file's role group
 * and marks the target line; jsdom has no scrollIntoView, so it is stubbed.
 */
describe("DiffTab · deep-link target", () => {
  // New side of this hunk: lines 10..13 (ctx10, add11, ctx12, ctx13).
  const A_PATCH = "@@ -10,3 +10,4 @@\n ctx10\n+add11\n ctx12\n ctx13";
  const DOC_PATCH = "@@ -1,2 +1,3 @@\n # Guide\n+guide-added\n more";
  const TARGET_FILES: PrFile[] = [mk("src/a.ts", A_PATCH), mk("docs/guide.md", DOC_PATCH)];

  beforeEach(() => {
    setSmart({
      data: smartResponse({
        groups: [
          { role: "core", files: [{ path: "src/a.ts", additions: 3, deletions: 0, finding_lines: [] }] },
          { role: "docs", files: [{ path: "docs/guide.md", additions: 3, deletions: 0, finding_lines: [] }] },
        ],
      }),
    });
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  function renderWithTarget(target: { file: string; line: number | null }) {
    return render(
      <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
        <DiffTab
          prId="pr1"
          filesCount={2}
          additions={6}
          deletions={0}
          files={TARGET_FILES}
          canComment={false}
          target={target}
        />
      </NextIntlClientProvider>,
    );
  }

  it("AC-34: a target in a collapsed role group opens the group and renders the file's patch lines", () => {
    renderWithTarget({ file: "docs/guide.md", line: null });
    expect(header("Docs")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("guide-added")).toBeInTheDocument();
  });

  it("AC-35: the target line is the one element marked data-target-line", () => {
    const { container } = renderWithTarget({ file: "src/a.ts", line: 11 });
    const marked = container.querySelectorAll('[data-target-line="true"]');
    expect(marked).toHaveLength(1);
    expect(marked[0]!.textContent).toContain("add11");
  });

  it("AC-36: a target line the diff does not render still opens the file, with no marked line", () => {
    const { container } = renderWithTarget({ file: "src/a.ts", line: 99 });
    expect(screen.getByText("add11")).toBeInTheDocument();
    expect(container.querySelector("[data-target-line]")).toBeNull();
  });

  it("AC-34: only the target's own role group is forced open; another collapsed group stays collapsed", () => {
    renderWithTarget({ file: "src/a.ts", line: 11 });
    expect(header("Core")).toHaveAttribute("aria-expanded", "true");
    expect(header("Docs")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("guide-added")).toBeNull();
  });

  it("AC-34: the target file's header takes focus (NFR-10)", () => {
    renderWithTarget({ file: "docs/guide.md", line: null });
    const path = screen.getByText("docs/guide.md");
    expect(path.parentElement).toBe(document.activeElement);
  });

  it("AC-48: without a target the groups, collapse defaults and marks are as before", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
        <DiffTab prId="pr1" filesCount={2} additions={6} deletions={0} files={TARGET_FILES} canComment={false} />
      </NextIntlClientProvider>,
    );
    expect(header("Core")).toHaveAttribute("aria-expanded", "true");
    expect(header("Docs")).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector("[data-target-line]")).toBeNull();
    expect(screen.queryByText("guide-added")).toBeNull();
    expect(document.activeElement).toBe(document.body);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("AC-34: in the flat fallback (smart diff unavailable) the target line is still marked", () => {
    setSmart({ data: undefined, isError: true });
    const { container } = renderWithTarget({ file: "src/a.ts", line: 11 });
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-target-line="true"]')).toHaveLength(1);
  });
});
