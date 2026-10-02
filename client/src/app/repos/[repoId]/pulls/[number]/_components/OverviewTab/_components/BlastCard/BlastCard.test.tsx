import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/blast.json";
import { BlastCard } from "./BlastCard";

/* Data hooks are mocked at the component's import specifier (client/AGENTS.md:
   data only via hooks). The HistoryAccordion and the Tree/Graph children are real. */
interface BlastQuery {
  data: BlastRadius | undefined;
  isLoading: boolean;
  isError: boolean;
}
let blastQuery: BlastQuery;
let resync: { start: () => void; running: boolean; error: Error | null };
const start = vi.fn();
const refetch = vi.fn();

vi.mock("@/lib/hooks", () => ({
  usePrBlast: () => ({ ...blastQuery, refetch }),
  useBlastResync: () => resync,
  usePrHistory: () => ({ data: { history: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
}));

const BLAST: BlastRadius = {
  changed_symbols: [
    { name: "A", file: "src/a.ts", kind: "function" },
    { name: "B", file: "src/b.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "A",
      callers: [
        { name: "handler", file: "src/x.ts", line: 12, depth: 1 },
        { name: "other", file: "src/y.ts", line: 3, depth: 1 },
        { name: "route", file: "src/r.ts", line: 4, depth: 2, through: "h" },
      ],
      endpoints_affected: ["GET /a"],
      crons_affected: ["nightly"],
    },
    {
      symbol: "B",
      callers: [{ name: "worker", file: "src/w.ts", line: 8, depth: 1 }],
      endpoints_affected: [],
      crons_affected: [],
    },
  ],
  summary: "2 symbol(s) → 4 caller(s) · 1 endpoint(s) · 1 cron(s)",
  degraded: false,
  indexed_sha: "idx1",
};

const tree = () => (
  <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
    <BlastCard prId="p1" repoId="r1" repoFullName="acme/api" headSha="head1" />
  </NextIntlClientProvider>
);

const symbolButton = (name: string) => screen.getByText(name, { selector: "span.mono" }).closest("button")!;

beforeEach(() => {
  blastQuery = { data: BLAST, isLoading: false, isError: false };
  resync = { start, running: false, error: null };
  start.mockReset();
  refetch.mockReset();
});
afterEach(cleanup);

describe("BlastCard — data", () => {
  it("shows the counters, expands only the first symbol, and links callers at the indexed sha", () => {
    render(tree());
    expect(screen.getByText("2 symbols")).toBeInTheDocument();
    expect(screen.getByText("4 callers")).toBeInTheDocument();
    expect(screen.getByText("1 endpoint")).toBeInTheDocument();
    expect(screen.getByText("1 cron/job")).toBeInTheDocument();

    expect(symbolButton("A")).toHaveAttribute("aria-expanded", "true");
    expect(symbolButton("B")).toHaveAttribute("aria-expanded", "false");

    expect(screen.getByRole("link", { name: "src/x.ts:12" })).toHaveAttribute(
      "href",
      "https://github.com/acme/api/blob/idx1/src/x.ts#L12",
    );
    expect(screen.getByText("via h")).toBeInTheDocument();
    expect(screen.getByText("GET /a")).toBeInTheDocument();
    expect(screen.getByText("nightly")).toBeInTheDocument();
    // B is collapsed: its caller is not in the document yet.
    expect(screen.queryByText("src/w.ts:8")).toBeNull();
  });

  it("an indirect caller is indented deeper than a direct one", () => {
    render(tree());
    const indent = (name: string) => parseInt(screen.getByText(name).parentElement!.style.paddingLeft, 10);
    expect(indent("handler")).toBeGreaterThan(0);
    expect(indent("route")).toBeGreaterThan(indent("handler"));
  });

  it("clicking a collapsed symbol expands it; clicking the open one collapses it", () => {
    render(tree());
    fireEvent.click(symbolButton("B"));
    expect(symbolButton("B")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("src/w.ts:8")).toBeInTheDocument();

    fireEvent.click(symbolButton("A"));
    expect(symbolButton("A")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("src/x.ts:12")).toBeNull();
  });

  it("without indexed_sha the caller links fall back to the PR head sha", () => {
    blastQuery = { ...blastQuery, data: { ...BLAST, indexed_sha: undefined } };
    render(tree());
    const href = screen.getByRole("link", { name: "src/x.ts:12" }).getAttribute("href");
    expect(href).toBe("https://github.com/acme/api/blob/head1/src/x.ts#L12");
  });

  it("the Graph switch shows the SVG for the first symbol; Tree switches back", () => {
    render(tree());
    expect(screen.getByRole("button", { name: "tree" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("img", { name: "Blast radius graph" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "graph" }));
    expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "graph" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "tree" }));
    expect(screen.queryByRole("img", { name: "Blast radius graph" })).toBeNull();
  });
});

describe("BlastCard — empty and degraded", () => {
  it("no downstream and not degraded: says no callers were found for the changed symbols", () => {
    blastQuery = { ...blastQuery, data: { ...BLAST, downstream: [] } };
    render(tree());
    expect(screen.getByText("2 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
  });

  it("no downstream: the Graph view says there is nothing to graph instead of an empty canvas", () => {
    blastQuery = { ...blastQuery, data: { ...BLAST, downstream: [] } };
    render(tree());
    fireEvent.click(screen.getByRole("button", { name: "graph" }));
    expect(screen.getByText("No downstream callers to graph.")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Blast radius graph" })).toBeNull();
  });

  it("degraded no_data: shows the reason and a Re-index button that starts the resync", () => {
    blastQuery = {
      ...blastQuery,
      data: { changed_symbols: [], downstream: [], summary: "s", degraded: true, reason: "no_data" },
    };
    render(tree());
    expect(screen.getByRole("status")).toHaveTextContent("This repo has not been indexed yet.");
    // A degraded empty result must not claim "no callers".
    expect(screen.queryByText(/no downstream callers found/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Re-index repo" }));
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("degraded flag_off: reason shown, no re-index button", () => {
    blastQuery = {
      ...blastQuery,
      data: { changed_symbols: [], downstream: [], summary: "s", degraded: true, reason: "flag_off" },
    };
    render(tree());
    expect(screen.getByRole("status")).toHaveTextContent("Repo intelligence is turned off (REPO_INTEL_ENABLED).");
    expect(screen.queryByRole("button", { name: "Re-index repo" })).toBeNull();
  });

  it("a partial index shows the notice AND the data", () => {
    blastQuery = { ...blastQuery, data: { ...BLAST, degraded: true, reason: "index_partial" } };
    render(tree());
    expect(screen.getByRole("status")).toHaveTextContent("The index is partial — some callers may be missing.");
    expect(screen.getByText("src/x.ts:12")).toBeInTheDocument();
  });

  it("while re-indexing the button reads 'Re-indexing…'; a failed resync is shown with its message", () => {
    blastQuery = { ...blastQuery, data: { ...BLAST, degraded: true, reason: "index_failed" } };
    resync = { start, running: true, error: null };
    const { rerender } = render(tree());
    expect(screen.getByRole("button", { name: /Re-indexing…/ })).toBeInTheDocument();

    resync = { start, running: false, error: new Error("boom") };
    rerender(tree());
    expect(screen.getByText("Re-index failed: boom")).toBeInTheDocument();
  });
});

describe("BlastCard — errors", () => {
  it("a failed load with no data shows the error state and Retry refetches", () => {
    blastQuery = { data: undefined, isLoading: false, isError: true };
    render(tree());
    expect(screen.getByText("Couldn't load the blast radius.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("a failed background refetch keeps the stale tree and shows no error", () => {
    blastQuery = { data: BLAST, isLoading: false, isError: true };
    render(tree());
    expect(screen.getByText("src/x.ts:12")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load the blast radius.")).toBeNull();
  });
});
