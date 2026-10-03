import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OverviewTab } from "./OverviewTab";

/* IntentCard and BlastCard are covered by their own tests; here only the layout
   contract counts: both cards are children of ONE grid container and the
   Description comes after it (AC-10). */
vi.mock("./_components/IntentCard", () => ({ IntentCard: () => <div data-testid="intent" /> }));
vi.mock("./_components/BlastCard", () => ({
  BlastCard: (p: { prId: string; repoId: string; repoFullName: string; headSha: string }) => (
    <div data-testid="blast" data-props={JSON.stringify(p)} />
  ),
}));

afterEach(cleanup);

const tree = (prBody: string | null) => (
  <OverviewTab prId="p1" repoId="r1" repoFullName="acme/api" headSha="head1" prBody={prBody} />
);

describe("OverviewTab", () => {
  it("puts IntentCard and BlastCard in the same container and the Description after it", () => {
    render(tree("The PR body text"));
    const intent = screen.getByTestId("intent");
    const blast = screen.getByTestId("blast");
    expect(intent.parentElement).toBe(blast.parentElement);

    const grid = intent.parentElement!;
    expect(grid).toHaveStyle({ display: "grid" });
    expect(grid.style.gridTemplateColumns).toContain("minmax(0, 1fr) minmax(0, 1fr)");
    const body = screen.getByText("The PR body text");
    expect(grid.contains(body)).toBe(false);
    expect(grid.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Description")).toBeInTheDocument();
  });

  it("passes the PR coordinates to the BlastCard", () => {
    render(tree(null));
    expect(JSON.parse(screen.getByTestId("blast").getAttribute("data-props")!)).toEqual({
      prId: "p1",
      repoId: "r1",
      repoFullName: "acme/api",
      headSha: "head1",
    });
  });

  it("has no Description block when the PR has no body", () => {
    render(tree(null));
    expect(screen.queryByText("Description")).toBeNull();
  });
});
