import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrHistory } from "@devdigest/shared";
import messages from "../../../../../../../../../../../../messages/en/blast.json";
import { HistoryAccordion } from "./HistoryAccordion";

interface HistoryQuery {
  data: PrHistory | undefined;
  isLoading: boolean;
  isError: boolean;
}
let query: HistoryQuery;
const refetch = vi.fn();

vi.mock("@/lib/hooks", () => ({
  usePrHistory: () => ({ ...query, refetch }),
}));

const ITEMS: PrHistory["history"] = [
  {
    pr_number: 41,
    title: "Add the cache layer",
    merged_at: "2026-03-02T00:00:00Z",
    author: "marisa",
    files_overlap: ["a.ts", "b.ts"],
    notes: "Fixes the cache",
  },
  {
    pr_number: 33,
    title: "Tidy the router",
    merged_at: "2026-02-02T00:00:00Z",
    author: "dev2",
    files_overlap: ["b.ts"],
    notes: "",
  },
];

const tree = (repoFullName: string | null = "acme/api") => (
  <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
    <HistoryAccordion prId="p1" repoFullName={repoFullName} />
  </NextIntlClientProvider>
);

const header = () => screen.getByRole("button", { name: /Prior PRs touching these files/ });
const expand = () => fireEvent.click(header());

beforeEach(() => {
  query = { data: { history: ITEMS }, isLoading: false, isError: false };
  refetch.mockReset();
});
afterEach(cleanup);

describe("HistoryAccordion", () => {
  it("starts collapsed with a count badge; expanding shows #N, title, author, overlap and notes", () => {
    render(tree());
    expect(header()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText("2 prior PRs")).toBeInTheDocument();
    expect(screen.queryByText("#41")).toBeNull();

    expand();
    expect(header()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "#41" })).toHaveAttribute("href", "https://github.com/acme/api/pull/41");
    expect(screen.getByText("Add the cache layer")).toBeInTheDocument();
    expect(screen.getByText(/marisa · merged /)).toBeInTheDocument();
    expect(screen.getByText("Fixes the cache")).toBeInTheDocument();
    expect(screen.getByText("2 files overlap")).toHaveAttribute("title", "a.ts\nb.ts");
    expect(screen.getByText("1 file overlaps")).toBeInTheDocument();
  });

  it("without a repo name the PR number is plain text, not a link", () => {
    render(tree(null));
    expand();
    expect(screen.getByText("#41")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "#41" })).toBeNull();
  });

  it("an empty history says so", () => {
    query = { data: { history: [] }, isLoading: false, isError: false };
    render(tree());
    expand();
    expect(
      screen.getByText("No prior merged PRs found for these files on the default branch."),
    ).toBeInTheDocument();
  });

  it("github_unavailable: the reason is shown and the empty message is not", () => {
    query = { data: { history: [], degraded: true, reason: "github_unavailable" }, isLoading: false, isError: false };
    render(tree());
    expand();
    expect(screen.getByText("GitHub is unavailable — check the token in Settings.")).toBeInTheDocument();
    expect(screen.queryByText(/No prior merged PRs found/)).toBeNull();
  });

  it("github_partial: the surviving item is listed together with the warning", () => {
    query = {
      data: { history: [ITEMS[0]!], degraded: true, reason: "github_partial" },
      isLoading: false,
      isError: false,
    };
    render(tree());
    expand();
    expect(screen.getByText("Some GitHub requests failed — this list may be incomplete.")).toBeInTheDocument();
    expect(screen.getByText("Add the cache layer")).toBeInTheDocument();
  });

  it("a failed load with no data shows the error and Retry refetches", () => {
    query = { data: undefined, isLoading: false, isError: true };
    render(tree());
    expand();
    expect(screen.getByText("Couldn't load prior PRs.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("a failed background refetch keeps the stale list and shows no error", () => {
    query = { data: { history: ITEMS }, isLoading: false, isError: true };
    render(tree());
    expand();
    expect(screen.getByText("Add the cache layer")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load prior PRs.")).toBeNull();
  });
});
