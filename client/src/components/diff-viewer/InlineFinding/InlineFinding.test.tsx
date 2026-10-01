import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import shell from "../../../../messages/en/shell.json";
import prReview from "../../../../messages/en/prReview.json";
import { InlineFinding } from "./InlineFinding";

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 12,
  end_line: 14,
  rationale: "A live Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderCard(props: Partial<React.ComponentProps<typeof InlineFinding>> = {}) {
  const onAction = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
      <InlineFinding f={FINDING} onAction={onAction} {...props} />
    </NextIntlClientProvider>,
  );
  return onAction;
}

describe("InlineFinding", () => {
  it("shows the line range, title, rationale and the suggested fix", () => {
    renderCard();
    expect(screen.getByText("line 12–14")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.getByText("A live Stripe key is committed in source.")).toBeInTheDocument();
    expect(screen.getByText("Suggested fix")).toBeInTheDocument();
    expect(screen.getByText("Move the key to an environment variable.")).toBeInTheDocument();
  });

  it("a single-line finding says 'line 12', not a range, and omits the fix block without a suggestion", () => {
    renderCard({ f: { ...FINDING, start_line: 12, end_line: 12, suggestion: null } });
    expect(screen.getByText("line 12")).toBeInTheDocument();
    expect(screen.queryByText(/12–12/)).toBeNull();
    expect(screen.queryByText("Suggested fix")).toBeNull();
  });

  it("Accept and Dismiss report their action", () => {
    const onAction = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onAction).toHaveBeenLastCalledWith("accept");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onAction).toHaveBeenLastCalledWith("dismiss");
    expect(onAction).toHaveBeenCalledTimes(2);
  });

  it("while an action is pending both buttons are disabled and do not fire", () => {
    const onAction = renderCard({ pending: true });
    const accept = screen.getByRole("button", { name: "Accept" });
    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    expect(accept).toBeDisabled();
    expect(dismiss).toBeDisabled();
    fireEvent.click(accept);
    fireEvent.click(dismiss);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("an accepted finding carries the 'accepted' tag; an open one does not", () => {
    renderCard({ f: { ...FINDING, accepted_at: "2026-10-01T00:00:00Z" } });
    expect(screen.getByText("accepted")).toBeInTheDocument();
    cleanup();
    renderCard();
    expect(screen.queryByText("accepted")).toBeNull();
  });
});
