import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, Severity } from "@devdigest/shared";
import shell from "../../../../messages/en/shell.json";
import prReview from "../../../../messages/en/prReview.json";
import type { Line } from "../helpers";
import type { DiffFindingApi } from "../findings";
import { CodeLine } from "./CodeLine";

afterEach(cleanup);

function finding(id: string, severity: Severity): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: `Title ${id}`,
    file: "src/a.ts",
    start_line: 2,
    end_line: 2,
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

const LINE: Line = { kind: "add", text: "const x = 1;", newNo: 2 };

function renderLine(findings: FindingRecord[], api?: Partial<DiffFindingApi>) {
  const onAction = vi.fn();
  const findingApi: DiffFindingApi = { findings, pendingId: null, onAction, ...api };
  render(
    <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
      <CodeLine ln={LINE} path="src/a.ts" threads={[]} findings={findings} findingApi={findingApi} />
    </NextIntlClientProvider>,
  );
  return onAction;
}

/** Titles of every inline card on screen, in DOM order. */
const cardTitles = () => screen.queryAllByRole("article").map((a) => a.getAttribute("aria-label"));

describe("CodeLine findings", () => {
  it("several findings on one line: the label shows the worst severity, ALL cards stack in the given order, and the label toggles them", () => {
    renderLine([finding("c1", "CRITICAL"), finding("w1", "WARNING"), finding("s1", "SUGGESTION")]);
    const label = screen.getByRole("button", { name: "Blocker" });
    expect(screen.queryByRole("button", { name: "Warning" })).toBeNull();
    expect(label).toHaveAttribute("aria-expanded", "true");
    expect(cardTitles()).toEqual(["Title c1", "Title w1", "Title s1"]);

    fireEvent.click(label);
    expect(label).toHaveAttribute("aria-expanded", "false");
    expect(cardTitles()).toEqual([]);

    fireEvent.click(label);
    expect(label).toHaveAttribute("aria-expanded", "true");
    expect(cardTitles()).toEqual(["Title c1", "Title w1", "Title s1"]);
  });

  it.each([
    {
      name: "1 CRITICAL and 2 WARNINGs",
      findings: [finding("c1", "CRITICAL"), finding("w1", "WARNING"), finding("w2", "WARNING")],
      label: "Blocker",
    },
    {
      name: "2 WARNINGs and 1 SUGGESTION",
      findings: [finding("w1", "WARNING"), finding("w2", "WARNING"), finding("s1", "SUGGESTION")],
      label: "Warning",
    },
    { name: "a worst WARNING", findings: [finding("w1", "WARNING"), finding("s1", "SUGGESTION")], label: "Warning" },
    { name: "a lone SUGGESTION", findings: [finding("s1", "SUGGESTION")], label: "Suggestion" },
    { name: "no findings", findings: [], label: null },
  ])("a line with $name is labelled $label", ({ findings, label }) => {
    renderLine(findings);
    if (label) {
      const badge = screen.getByRole("button", { name: label });
      expect(badge.querySelector("svg")).not.toBeNull(); // the severity icon
      expect(screen.getAllByRole("button", { name: /^(Blocker|Warning|Suggestion)$/ })).toHaveLength(1);
      expect(screen.getAllByRole("article")).toHaveLength(findings.length);
    } else {
      expect(screen.queryByRole("button", { name: /Blocker|Warning|Suggestion/ })).toBeNull();
      expect(screen.queryByRole("article")).toBeNull();
    }
  });

  it("a card's Accept reports the finding id and action; only the in-flight finding is disabled", () => {
    const onAction = renderLine([finding("c1", "CRITICAL"), finding("w1", "WARNING")], { pendingId: "w1" });
    const card = (title: string) => within(screen.getByRole("article", { name: title }));
    expect(card("Title w1").getByRole("button", { name: "Accept" })).toBeDisabled();
    const accept = card("Title c1").getByRole("button", { name: "Accept" });
    expect(accept).toBeEnabled();
    fireEvent.click(accept);
    expect(onAction).toHaveBeenCalledWith("c1", "accept");
  });
});
