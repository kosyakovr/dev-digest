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

describe("CodeLine findings", () => {
  it("the label button toggles the inline card: collapse hides it, expand brings it back", () => {
    renderLine([finding("c1", "CRITICAL")]);
    const label = screen.getByRole("button", { name: "blocker" });
    expect(label).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Title c1")).toBeInTheDocument();

    fireEvent.click(label);
    expect(label).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Title c1")).toBeNull();

    fireEvent.click(label);
    expect(label).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Title c1")).toBeInTheDocument();
  });

  it("several findings on one line: the label shows the worst severity and ALL cards stack in the given order", () => {
    renderLine([finding("c1", "CRITICAL"), finding("w1", "WARNING"), finding("s1", "SUGGESTION")]);
    expect(screen.getByRole("button", { name: "blocker" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "warning" })).toBeNull();
    const ids = [...document.body.querySelectorAll("[data-finding-id]")].map((el) => el.getAttribute("data-finding-id"));
    expect(ids).toEqual(["c1", "w1", "s1"]);
    expect(screen.getByText("Title w1")).toBeInTheDocument();
    expect(screen.getByText("Title s1")).toBeInTheDocument();
  });

  it("a line whose worst finding is a WARNING is labelled 'warning'; a SUGGESTION one 'suggestion'", () => {
    renderLine([finding("w1", "WARNING"), finding("s1", "SUGGESTION")]);
    expect(screen.getByRole("button", { name: "warning" })).toBeInTheDocument();
    cleanup();
    renderLine([finding("s1", "SUGGESTION")]);
    expect(screen.getByRole("button", { name: "suggestion" })).toBeInTheDocument();
  });

  it("a card's Accept reports the finding id and action; only the in-flight finding is disabled", () => {
    const onAction = renderLine([finding("c1", "CRITICAL"), finding("w1", "WARNING")], { pendingId: "w1" });
    const card = (id: string) =>
      document.querySelector(`[data-finding-id="${id}"]`) as HTMLElement;
    expect(within(card("w1")).getByRole("button", { name: "Accept" })).toBeDisabled();
    const accept = within(card("c1")).getByRole("button", { name: "Accept" });
    expect(accept).toBeEnabled();
    fireEvent.click(accept);
    expect(onAction).toHaveBeenCalledWith("c1", "accept");
  });

  it("a line without findings has no label button and no card", () => {
    renderLine([]);
    expect(screen.queryByRole("button", { name: /blocker|warning|suggestion/ })).toBeNull();
    expect(document.querySelector("[data-finding-id]")).toBeNull();
  });
});
