import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, Severity } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import shell from "../../../../messages/en/shell.json";
import prReview from "../../../../messages/en/prReview.json";
import type { DiffCommentApi } from "../comments";
import type { DiffFindingApi } from "../findings";
import { FileCard } from "./FileCard";

afterEach(cleanup);

const PATCH = "@@ -1,2 +1,3 @@\n ctx\n+added\n ctx2"; // new lines 1 (ctx), 2 (add), 3 (ctx)
const OUTSIDE_HEADING = "Findings outside the visible diff";

function finding(id: string, severity: Severity, start_line: number, file = "src/a.ts"): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: `Title ${id}`,
    file,
    start_line,
    end_line: start_line,
    rationale: `Rationale ${id}`,
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

const file = (over: Partial<PrFile> = {}): PrFile => ({
  path: "src/a.ts",
  additions: 3,
  deletions: 0,
  patch: PATCH,
  ...over,
});

function api(findings: FindingRecord[]): DiffFindingApi {
  return { findings, pendingId: null, onAction: vi.fn() };
}

function renderCard(f: PrFile, findings?: DiffFindingApi, commenting?: DiffCommentApi) {
  render(
    <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
      <FileCard file={f} findings={findings} commenting={commenting} />
    </NextIntlClientProvider>,
  );
}

const outsideRegion = () => screen.getByRole("region", { name: OUTSIDE_HEADING });
/** Titles of every inline card on screen, in DOM order. */
const cardTitles = () => screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"));

describe("FileCard findings", () => {
  it("marks the file, stacks same-line cards by severity then id, and lists an unanchored finding in the outside region above them", () => {
    renderCard(
      file(),
      api([
        finding("W1", "WARNING", 2),
        finding("C1", "CRITICAL", 2),
        finding("C0", "CRITICAL", 2),
        finding("Outside", "SUGGESTION", 50),
      ]),
    );

    expect(screen.getByLabelText("Has findings")).toBeInTheDocument();
    // One label for the line, showing the worst severity of the three.
    expect(screen.getAllByRole("button", { name: "Blocker" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Warning" })).toBeNull();

    // The outside list comes first, then the stacked cards of line 2.
    expect(cardTitles()).toEqual(["Title Outside", "Title C0", "Title C1", "Title W1"]);
    // Only the unanchored one sits in the outside region, under its heading.
    const outside = within(outsideRegion());
    expect(outside.getByText(OUTSIDE_HEADING)).toBeInTheDocument();
    expect(outside.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["Title Outside"]);
  });

  it.each([
    {
      name: "a file without patch text",
      card: () => file({ patch: null }),
      anchored: finding("P", "WARNING", 3),
      note: "No diff text available (binary or unfetched patch).",
    },
    {
      name: "a finding on a removed (old-side-only) line",
      card: () => file({ patch: "@@ -1,2 +1,1 @@\n ctx\n-removed", additions: 0, deletions: 1 }),
      anchored: finding("D", "WARNING", 2),
      note: null,
    },
  ])("$name is not anchored: it goes to the outside region and no line label appears", ({ card, anchored, note }) => {
    renderCard(card(), api([anchored]));
    if (note) expect(screen.getByText(note)).toBeInTheDocument();
    expect(within(outsideRegion()).getByRole("article", { name: `Title ${anchored.id}` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Warning" })).toBeNull();
  });

  it("without findings for this file (another file's only, or no findings prop) no dot, region, label or card is rendered", () => {
    const expectNoFindingsUi = () => {
      expect(screen.queryByLabelText("Has findings")).toBeNull();
      expect(screen.queryByRole("region", { name: OUTSIDE_HEADING })).toBeNull();
      expect(screen.queryByText(OUTSIDE_HEADING)).toBeNull();
      expect(screen.queryByRole("button", { name: "Blocker" })).toBeNull();
      expect(screen.queryByRole("article")).toBeNull();
    };
    renderCard(file(), api([finding("X", "CRITICAL", 2, "src/other.ts")]));
    expectNoFindingsUi();
    cleanup();
    renderCard(file());
    expectNoFindingsUi();
  });

  it("cards render even when comments are hidden, and the GitHub comment counter stays next to the dot", () => {
    const comments = [1, 2, 3, 4].map((id) => ({
      id,
      path: "src/a.ts",
      line: null,
      original_line: null,
      side: "RIGHT" as const,
      body: "c",
      user: "u",
      created_at: `2026-06-0${id}T00:00:00Z`,
      html_url: "https://example.test",
      in_reply_to_id: null,
      is_outdated: true,
    }));
    const commenting: DiffCommentApi = {
      comments,
      canComment: false,
      showComments: false,
      posting: false,
      onSubmit: vi.fn(),
    };
    renderCard(file(), api([finding("C1", "CRITICAL", 2)]), commenting);
    expect(screen.getByRole("article", { name: "Title C1" })).toBeInTheDocument();
    expect(screen.getByLabelText("Has findings")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument(); // the comment counter, unchanged
  });
});

describe("FileCard deep-link target (AC-34, AC-36, NFR-10)", () => {
  // A big file: 300 changed lines, so it starts CLOSED without a target.
  // New side of the hunk: 10 (ctx), 11 (add), 12 (ctx), 13 (ctx).
  const BIG_PATCH = "@@ -10,3 +10,4 @@\n ctx10\n+add11\n ctx12\n ctx13";
  const big = (over: Partial<PrFile> = {}) => file({ additions: 300, deletions: 0, patch: BIG_PATCH, ...over });
  const scrollIntoView = vi.fn();
  const header = () => screen.getByText("src/a.ts").parentElement as HTMLElement;

  function renderTargeted(f: PrFile, target: { file: string; line: number | null } | null) {
    return render(
      <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
        <FileCard file={f} target={target} />
      </NextIntlClientProvider>,
    );
  }

  beforeEach(() => {
    scrollIntoView.mockReset();
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it("without a target a big file stays closed, nothing scrolls, nothing is marked", () => {
    const { container } = renderTargeted(big(), null);
    expect(screen.queryByText("add11")).toBeNull();
    expect(container.querySelector("[data-target-line]")).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });

  it("a target opens a closed file, marks the one target line, scrolls it into view and focuses the header", () => {
    const { container } = renderTargeted(big(), { file: "src/a.ts", line: 11 });
    expect(screen.getByText("add11")).toBeInTheDocument();
    const marked = container.querySelectorAll('[data-target-line="true"]');
    expect(marked).toHaveLength(1);
    expect(marked[0]!.textContent).toContain("add11");
    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollIntoView.mock.contexts[0]).toBe(marked[0]);
    expect(document.activeElement).toBe(header());
  });

  it("a context line on the new side is the target too", () => {
    const { container } = renderTargeted(big(), { file: "src/a.ts", line: 12 });
    const marked = container.querySelectorAll('[data-target-line="true"]');
    expect(marked).toHaveLength(1);
    expect(marked[0]!.textContent).toContain("ctx12");
  });

  it("a target line that is not rendered still opens the file, marks no line, and scrolls the card", () => {
    const { container } = renderTargeted(big(), { file: "src/a.ts", line: 99 });
    expect(screen.getByText("add11")).toBeInTheDocument();
    expect(container.querySelector("[data-target-line]")).toBeNull();
    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(header());
  });

  it("a target without a line (a risk file) opens the file and marks no line", () => {
    const { container } = renderTargeted(big(), { file: "src/a.ts", line: null });
    expect(screen.getByText("add11")).toBeInTheDocument();
    expect(container.querySelector("[data-target-line]")).toBeNull();
    expect(document.activeElement).toBe(header());
  });
});
