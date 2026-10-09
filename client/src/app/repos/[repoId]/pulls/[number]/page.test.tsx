import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * PR detail page wiring for the Risk Brief deep link (plan WP8/WP9; spec AC-34,
 * AC-37, A-15, A-34): the Overview opens Files changed with `router.push`, the
 * query carries `file` (and `line`), DiffTab receives the target read from it, and
 * a tab click clears the target. Children are stubs; only the page's own wiring counts.
 */

const nav = vi.hoisted(() => ({
  search: new URLSearchParams("tab=overview"),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1", number: "7" }),
  useSearchParams: () => nav.search,
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
}));
vi.mock("../../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => null }));
vi.mock("../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/api" } }),
  useRepoNotFound: () => false,
}));
vi.mock("../../../../../lib/hooks", () => ({
  usePulls: () => ({ data: [{ id: "p1", number: 7 }], isLoading: false }),
  usePullDetail: () => ({
    data: {
      number: 7,
      head_sha: "head1",
      body: null,
      status: "open",
      files_count: 2,
      additions: 2,
      deletions: 0,
      commits: [],
      files: [
        { path: "src/a.ts", additions: 1, deletions: 0, patch: null },
        { path: "src/a b.ts", additions: 1, deletions: 0, patch: null },
      ],
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../../../../lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [], refetch: vi.fn() }),
  useCancelRun: () => ({}),
  usePrActiveRuns: () => ({ data: [] }),
  usePrRuns: () => ({ data: [] }),
  useDeleteRun: () => ({ mutate: vi.fn() }),
}));
vi.mock("./_components/PrDetailHeader", () => ({
  PrDetailHeader: ({ onSetTab }: { onSetTab: (t: string) => void }) => (
    <div>
      <button onClick={() => onSetTab("overview")}>go-overview</button>
      <button onClick={() => onSetTab("diff")}>go-diff</button>
    </div>
  ),
}));
vi.mock("./_components/OverviewTab", () => ({
  OverviewTab: (p: { changedFiles: string[]; onOpenFile: (f: string, l: number | null) => void }) => (
    <div data-testid="overview" data-files={JSON.stringify(p.changedFiles)}>
      <button onClick={() => p.onOpenFile("src/a b.ts", 12)}>open-focus</button>
      <button onClick={() => p.onOpenFile("src/a.ts", null)}>open-risk</button>
    </div>
  ),
}));
vi.mock("./_components/DiffTab", () => ({
  DiffTab: (p: { target?: unknown }) => <div data-testid="diff" data-target={JSON.stringify(p.target ?? null)} />,
}));
vi.mock("./_components/FindingsTab", () => ({ FindingsTab: () => null }));
vi.mock("./_components/RunTraceDrawer", () => ({ default: () => null }));

import PRDetailPage from "./page";

function renderPage() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <PRDetailPage />
    </QueryClientProvider>,
  );
}

/** The query string of a pushed / replaced URL, parsed. */
const queryOf = (url: string) => new URLSearchParams(url.split("?")[1] ?? "");

beforeEach(() => {
  nav.search = new URLSearchParams("tab=overview");
  nav.push.mockReset();
  nav.replace.mockReset();
});
afterEach(cleanup);

describe("PR detail page · Risk Brief deep link", () => {
  it("the Overview gets the PR's changed paths", () => {
    renderPage();
    expect(JSON.parse(screen.getByTestId("overview").getAttribute("data-files")!)).toEqual(["src/a.ts", "src/a b.ts"]);
  });

  it("AC-34: opening a focus item PUSHES ?tab=diff&file=…&line=… (Back returns to Overview)", () => {
    renderPage();
    fireEvent.click(screen.getByText("open-focus"));
    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(nav.replace).not.toHaveBeenCalled();
    const url = nav.push.mock.calls[0]![0] as string;
    expect(url.startsWith("/repos/r1/pulls/7?")).toBe(true);
    const q = queryOf(url);
    expect(q.get("tab")).toBe("diff");
    expect(q.get("file")).toBe("src/a b.ts");
    expect(q.get("line")).toBe("12");
  });

  it("AC-37: opening a risk file pushes the file with no line", () => {
    renderPage();
    fireEvent.click(screen.getByText("open-risk"));
    const q = queryOf(nav.push.mock.calls[0]![0] as string);
    expect(q.get("tab")).toBe("diff");
    expect(q.get("file")).toBe("src/a.ts");
    expect(q.has("line")).toBe(false);
  });

  it("the Files changed tab receives the target read from the query", () => {
    nav.search = new URLSearchParams("tab=diff&file=src%2Fa.ts&line=12");
    renderPage();
    expect(JSON.parse(screen.getByTestId("diff").getAttribute("data-target")!)).toEqual({ file: "src/a.ts", line: 12 });
  });

  it("without file in the query the Files changed tab gets no target", () => {
    nav.search = new URLSearchParams("tab=diff");
    renderPage();
    expect(JSON.parse(screen.getByTestId("diff").getAttribute("data-target")!)).toBeNull();
  });

  it("A-34: a tab click replaces the URL and clears file and line, keeping other params", () => {
    nav.search = new URLSearchParams("tab=diff&file=src%2Fa.ts&line=12&trace=r9");
    renderPage();
    fireEvent.click(screen.getByText("go-overview"));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    const q = queryOf(nav.replace.mock.calls[0]![0] as string);
    expect(q.get("tab")).toBe("overview");
    expect(q.has("file")).toBe(false);
    expect(q.has("line")).toBe(false);
    expect(q.get("trace")).toBe("r9");
  });
});
