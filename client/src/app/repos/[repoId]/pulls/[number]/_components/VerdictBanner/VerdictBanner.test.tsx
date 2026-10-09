import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { VerdictBanner } from "./VerdictBanner";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("VerdictBanner (smoke)", () => {
  it("shows verdict label + score + finding/blocker counts", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="request_changes"
        summary="Hardcoded secret introduced."
        score={42}
        findingsCount={1}
        blockers={1}
        agentName="Security Reviewer"
      />,
    );
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/1 findings · 1 blockers/)).toBeInTheDocument();
  });
});

describe("VerdictBanner · optional parts (Risk Brief)", () => {
  it("AC-28: with only a summary and a regenerate action it shows no verdict, findings badge or score", () => {
    renderWithIntl(
      <VerdictBanner summary="S" onRegenerate={() => {}} regenerateLabel="Re-run the brief for this PR" />,
    );
    expect(screen.getByText("S")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-run the brief for this PR" })).toBeInTheDocument();
    for (const absent of ["Request changes", "Approve", "Comment", "PR SCORE"]) {
      expect(screen.queryByText(absent), absent).toBeNull();
    }
    expect(screen.queryByText(/findings/)).toBeNull();
  });

  it("AC-25: loading shows a spinner in place of the score", () => {
    const { container } = renderWithIntl(
      <VerdictBanner summary={null} score={42} loading footer={<span>F</span>} />,
    );
    expect(screen.queryByText("42")).toBeNull();
    expect(screen.queryByText("PR SCORE")).toBeNull();
    expect(container.querySelector('[style*="ddspin"]')).not.toBeNull();
  });

  it("without loading there is no spinner, and a score is shown", () => {
    const { container } = renderWithIntl(<VerdictBanner summary="S" score={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(container.querySelector('[style*="ddspin"]')).toBeNull();
  });

  it("provenance is an image named and titled by its text", () => {
    renderWithIntl(<VerdictBanner summary="S" provenance="P" />);
    const mark = screen.getByLabelText("P");
    expect(mark).toHaveAttribute("role", "img");
    expect(mark).toHaveAttribute("title", "P");
  });

  it("footer renders after the summary", () => {
    renderWithIntl(<VerdictBanner summary="S" footer={<span>F</span>} />);
    const summary = screen.getByText("S");
    const footer = screen.getByText("F");
    expect(summary.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the regenerate button calls onRegenerate, and regenerateDisabled disables it", () => {
    const onRegenerate = vi.fn();
    const { rerender } = renderWithIntl(
      <VerdictBanner summary="S" onRegenerate={onRegenerate} regenerateLabel="Redo" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);

    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <VerdictBanner summary="S" onRegenerate={onRegenerate} regenerateLabel="Redo" regenerateDisabled />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("AC-27: with a verdict, counts, score and agent they are all shown beside the summary", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="approve"
        summary="S"
        score={90}
        findingsCount={3}
        blockers={0}
        agentName="General"
        provenance="P"
      />,
    );
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("3 findings")).toBeInTheDocument();
    expect(screen.getByText("90")).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("S")).toBeInTheDocument();
  });
});
