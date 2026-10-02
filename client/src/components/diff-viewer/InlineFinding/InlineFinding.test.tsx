import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
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
  it("shows range, title, rationale and fix; a single-line finding without suggestion says 'line 12' and omits the fix; 'accepted' only when accepted", () => {
    renderCard();
    const card = within(screen.getByRole("article", { name: "Hardcoded Stripe secret key" }));
    expect(card.getByText("line 12–14")).toBeInTheDocument();
    expect(card.getByText("A live Stripe key is committed in source.")).toBeInTheDocument();
    expect(card.getByText("Suggested fix")).toBeInTheDocument();
    expect(card.getByText("Move the key to an environment variable.")).toBeInTheDocument();
    expect(card.queryByText("accepted")).toBeNull();
    cleanup();

    renderCard({ f: { ...FINDING, start_line: 12, end_line: 12, suggestion: null, accepted_at: "2026-10-01T00:00:00Z" } });
    expect(screen.getByText("line 12")).toBeInTheDocument();
    expect(screen.queryByText(/12–12/)).toBeNull();
    expect(screen.queryByText("Suggested fix")).toBeNull();
    expect(screen.getByText("accepted")).toBeInTheDocument();
  });

  it("Accept and Dismiss report their action; while an action is pending both are disabled and do not fire", () => {
    const onAction = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onAction).toHaveBeenLastCalledWith("accept");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onAction).toHaveBeenLastCalledWith("dismiss");
    expect(onAction).toHaveBeenCalledTimes(2);
    cleanup();

    const pendingAction = renderCard({ pending: true });
    const accept = screen.getByRole("button", { name: "Accept" });
    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    expect(accept).toBeDisabled();
    expect(dismiss).toBeDisabled();
    fireEvent.click(accept);
    fireEvent.click(dismiss);
    expect(pendingAction).not.toHaveBeenCalled();
  });
});
