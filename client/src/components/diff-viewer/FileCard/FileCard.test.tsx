import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
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
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
      <FileCard file={f} findings={findings} commenting={commenting} />
    </NextIntlClientProvider>,
  );
}

const cardIds = (c: HTMLElement) =>
  [...c.querySelectorAll("[data-finding-id]")].map((el) => el.getAttribute("data-finding-id"));

describe("FileCard findings", () => {
  it("marks the file, stacks same-line cards by severity then id, and lists an unanchored finding under the outside heading", () => {
    const { container } = renderCard(
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
    expect(screen.getAllByRole("button", { name: "blocker" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "warning" })).toBeNull();

    // The outside list comes first, then the stacked cards of line 2.
    expect(cardIds(container)).toEqual(["Outside", "C0", "C1", "W1"]);
    const heading = screen.getByText(OUTSIDE_HEADING);
    const outside = container.querySelector('[data-finding-id="Outside"]')!;
    expect(heading.compareDocumentPosition(outside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const stacked = container.querySelector('[data-finding-id="C0"]')!;
    expect(outside.compareDocumentPosition(stacked) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Only the unanchored one is under the heading's wrapper.
    expect(heading.parentElement!.querySelectorAll("[data-finding-id]")).toHaveLength(1);
  });

  it("a file without findings has no dot, no outside list and no label", () => {
    renderCard(file(), api([finding("X", "CRITICAL", 2, "src/other.ts")]));
    expect(screen.queryByLabelText("Has findings")).toBeNull();
    expect(screen.queryByText(OUTSIDE_HEADING)).toBeNull();
    expect(screen.queryByRole("button", { name: "blocker" })).toBeNull();
    expect(document.querySelector("[data-finding-id]")).toBeNull();
  });

  it("without the findings prop nothing findings-related is rendered", () => {
    renderCard(file());
    expect(screen.queryByLabelText("Has findings")).toBeNull();
    expect(screen.queryByText(OUTSIDE_HEADING)).toBeNull();
  });

  it("a file without patch text: the 'no diff text' note, and the finding goes to the outside list", () => {
    renderCard(file({ patch: null }), api([finding("P", "WARNING", 3)]));
    expect(screen.getByText("No diff text available (binary or unfetched patch).")).toBeInTheDocument();
    const heading = screen.getByText(OUTSIDE_HEADING);
    expect(heading.parentElement!.querySelector('[data-finding-id="P"]')).not.toBeNull();
    expect(screen.queryByRole("button", { name: "warning" })).toBeNull();
  });

  it("a finding on a removed (old-side-only) line is not anchored: outside list, no label", () => {
    renderCard(
      file({ patch: "@@ -1,2 +1,1 @@\n ctx\n-removed", additions: 0, deletions: 1 }),
      api([finding("D", "WARNING", 2)]),
    );
    expect(screen.queryByRole("button", { name: "warning" })).toBeNull();
    const heading = screen.getByText(OUTSIDE_HEADING);
    expect(heading.parentElement!.querySelector('[data-finding-id="D"]')).not.toBeNull();
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
    expect(screen.getByText("Title C1")).toBeInTheDocument();
    expect(screen.getByLabelText("Has findings")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument(); // the comment counter, unchanged
  });
});
