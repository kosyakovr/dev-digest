import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import commonMessages from "../../../../../../../../messages/en/common.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";
import { OverviewTab } from "./OverviewTab";

/* IntentCard and BlastCard are covered by their own tests; here only the layout
   contract counts: both cards are children of ONE grid container and the
   Description comes after it (AC-10). The IntentCard stand-in renders its
   `children`, because the brief's Risk areas live inside the Intent card
   (plan WP8: the `children` slot), so a test can see where they land. */
vi.mock("./_components/IntentCard", () => ({
  IntentCard: ({ children }: { children?: React.ReactNode }) => <div data-testid="intent">{children}</div>,
}));
vi.mock("./_components/BlastCard", () => ({
  BlastCard: (p: { prId: string; repoId: string; repoFullName: string; headSha: string }) => (
    <div data-testid="blast" data-props={JSON.stringify(p)} />
  ),
}));

/**
 * Risk Brief on the Overview tab (plan docs/plans/L05-risk-brief.md, WP8.tests
 * [T1]; spec AC-24, AC-27, AC-29, AC-32, AC-34, AC-37, AC-39, AC-40, AC-41,
 * AC-55, AC-57, AC-58, NFR-10). OverviewTab is driven through the REAL brief
 * hooks over a stubbed `fetch`, keyed "METHOD /path" as the tour page test does.
 * Expected strings are the spec's § Contract wording, not read from brief.json.
 */

// ------------------------------------------------------------------ fixtures

type Reply = { status?: number; body: unknown };
type Route = Reply | (() => Reply | Promise<Reply>);
let requests: string[] = [];

function stubApi(routes: Record<string, Route>) {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const key = `${(init?.method ?? "GET").toUpperCase()} ${url.pathname}${url.search}`;
      requests.push(key);
      const hit = routes[key];
      if (hit === undefined) {
        return new Response(JSON.stringify({ error: { code: "not_found", message: `no stub for ${key}` } }), {
          status: 404,
        });
      }
      const reply = typeof hit === "function" ? await hit() : hit;
      return new Response(JSON.stringify(reply.body), {
        status: reply.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

const GET = "GET /pulls/p1/brief";
const POST = "POST /pulls/p1/brief";
const posts = () => requests.filter((k) => k === POST);

const GENERATION = {
  head_sha: "abcdef0123",
  generated_at: "2026-10-09T10:00:00.000Z",
  provider: "openai",
  model: "gpt-4.1",
  tokens_in: 100,
  tokens_out: 50,
  cost_usd: 0.0123,
  specs_read: [] as string[],
};

const briefWith = (over: Record<string, unknown> = {}) => ({
  intent: { intent: "Do X", in_scope: [], out_of_scope: [] },
  blast: { changed_symbols: [], downstream: [], summary: "" },
  risks: {
    risks: [
      { kind: "security", title: "T", severity: "high", file_refs: ["src/a.ts"], explanation: "E" },
    ],
  },
  history: { history: [] },
  summary: "S",
  review_focus: [
    { file: "src/a.ts", line: 12, reason: "R" },
    { file: "gone.ts", line: 3, reason: "Q" },
  ],
  generation: GENERATION,
  ...over,
});

const stateOf = (brief: unknown, over: Record<string, unknown> = {}) => ({
  brief,
  generating: false,
  stale: false,
  ...over,
});

const EMPTY_STATE = stateOf(null);

const finding = (id: string, severity: FindingRecord["severity"], over: Partial<FindingRecord> = {}): FindingRecord => ({
  id,
  severity,
  category: "bug",
  title: id,
  file: "src/a.ts",
  start_line: 1,
  end_line: 1,
  rationale: `Rationale of ${id}`,
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "rv1",
  accepted_at: null,
  dismissed_at: null,
  ...over,
});

const securityReview: ReviewRecord = {
  id: "rv1",
  pr_id: "p1",
  agent_id: "a1",
  run_id: "run1",
  agent_name: "Security Reviewer",
  kind: "review",
  verdict: "request_changes",
  summary: "Hardcoded secret introduced.",
  score: 42,
  model: "m",
  created_at: "2026-10-09T09:00:00.000Z",
  findings: [finding("crit", "CRITICAL"), finding("warn", "WARNING")],
};

// ------------------------------------------------------------------- helpers

const CHANGED = ["src/a.ts"];

function renderTab(opts: { prBody?: string | null; reviews?: ReviewRecord[]; onOpenFile?: () => void } = {}) {
  const onOpenFile = opts.onOpenFile ?? vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider
        locale="en"
        messages={{
          brief: briefMessages,
          prReview: prReviewMessages,
          common: commonMessages,
          shell: shellMessages,
        }}
      >
        <OverviewTab
          prId="p1"
          repoId="r1"
          repoFullName="acme/api"
          headSha="head1"
          prBody={opts.prBody ?? null}
          changedFiles={CHANGED}
          reviews={opts.reviews ?? []}
          onOpenFile={onOpenFile}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { onOpenFile, queryClient, container };
}

/** Give a (wrongly) automatic POST time to fire before asserting there was none. */
const settle = () => new Promise((r) => setTimeout(r, 60));

const REFRESH = "Re-run the brief for this PR";

beforeEach(() => {
  stubApi({ [GET]: { body: EMPTY_STATE } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ------------------------------------------------------- existing layout cases

describe("OverviewTab", () => {
  it("puts IntentCard and BlastCard in the same container and the Description after it", () => {
    renderTab({ prBody: "The PR body text" });
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
    renderTab();
    expect(JSON.parse(screen.getByTestId("blast").getAttribute("data-props")!)).toEqual({
      prId: "p1",
      repoId: "r1",
      repoFullName: "acme/api",
      headSha: "head1",
    });
  });

  it("has no Description block when the PR has no body", () => {
    renderTab();
    expect(screen.queryByText("Description")).toBeNull();
  });
});

// ------------------------------------------------------------ Risk Brief [T1]

describe("OverviewTab · PR Brief section", () => {
  it("AC-24: with no brief it shows the empty state and a Generate brief button", async () => {
    renderTab();
    expect(await screen.findByText("No brief yet")).toBeInTheDocument();
    expect(screen.getByText("PR Brief")).toBeInTheDocument();
    expect(screen.getByText("Generate a Why+Risk brief for this PR.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeInTheDocument();
  });

  it("AC-57: Generate brief sends exactly one POST and asks for no confirmation", async () => {
    stubApi({ [GET]: { body: EMPTY_STATE }, [POST]: { body: stateOf(briefWith()) } });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Generate brief" }));

    expect(await screen.findByText("S")).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
    expect(screen.queryByText("Replace this brief?")).toBeNull();
  });

  it("AC-40: a stored brief renders on load and no POST is ever sent", async () => {
    stubApi({ [GET]: { body: stateOf(briefWith()) } });
    renderTab();
    expect(await screen.findByText("S")).toBeInTheDocument();
    await settle();
    expect(posts()).toHaveLength(0);
  });

  it("AC-27: the banner shows the latest review's verdict, counts, score and agent with the brief's summary", async () => {
    stubApi({ [GET]: { body: stateOf(briefWith()) } });
    renderTab({ reviews: [securityReview] });

    expect(await screen.findByText("S")).toBeInTheDocument();
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    // two findings, one of them an undismissed CRITICAL = one blocker
    expect(screen.getByText("2 findings · 1 blockers")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
  });

  it("AC-39: a stale brief names the 7-character SHA, stays visible and sends no POST", async () => {
    stubApi({ [GET]: { body: stateOf(briefWith(), { stale: true }) } });
    renderTab();
    expect(await screen.findByText("Generated for abcdef0 — there are new commits")).toBeInTheDocument();
    expect(screen.getByText("S")).toBeInTheDocument();
    await settle();
    expect(posts()).toHaveLength(0);
  });

  it("AC-58: the model and cost are shown under the summary as one line", async () => {
    stubApi({ [GET]: { body: stateOf(briefWith()) } });
    renderTab();
    expect(await screen.findByText("gpt-4.1 · $0.01")).toBeInTheDocument();
  });

  it("AC-55 / AC-41: refresh opens the confirm dialog without a POST; Regenerate sends one and the new summary replaces the old", async () => {
    stubApi({
      [GET]: { body: stateOf(briefWith()) },
      [POST]: { body: stateOf(briefWith({ summary: "S2" })) },
    });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: REFRESH }));

    expect(screen.getByText("Replace this brief?")).toBeInTheDocument();
    expect(
      screen.getByText("Regenerating makes one model call on your API key and replaces the current brief."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(posts()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(await screen.findByText("S2")).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
    expect(screen.queryByText("S")).toBeNull();
  });
});

describe("OverviewTab · Risk areas and Review focus", () => {
  beforeEach(() => {
    stubApi({ [GET]: { body: stateOf(briefWith()) } });
  });

  it("AC-29: Risk areas sit inside the Intent card with title, severity text and the first file as a button", async () => {
    renderTab();
    const intent = await screen.findByTestId("intent");
    expect(await within(intent).findByText("Risk areas")).toBeInTheDocument();
    expect(within(intent).getByText("T")).toBeInTheDocument();
    expect(within(intent).getByText("High")).toBeInTheDocument();
    expect(within(intent).getByRole("button", { name: "Open src/a.ts in Files changed" })).toBeInTheDocument();
  });

  it("AC-32 / NFR-10: Review focus lists its items as named buttons in stored order, with a count badge", async () => {
    renderTab();
    expect(await screen.findByText("Review focus — read these first")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    const first = screen.getByRole("button", { name: "Open src/a.ts:12 in Files changed" });
    const second = screen.getByRole("button", { name: "Open gone.ts:3 in Files changed" });
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // the location (link-coloured) and the reason both belong to the named button
    expect(within(first).getByText("src/a.ts:12")).toHaveStyle({ color: "var(--accent-text)" });
    expect(within(first).getByText("— R")).toBeInTheDocument();
  });

  it("AC-34 / AC-37: a focus row opens its file at its line; a risk file opens the file with no line", async () => {
    const { onOpenFile } = renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Open src/a.ts:12 in Files changed" }));
    expect(onOpenFile).toHaveBeenLastCalledWith("src/a.ts", 12);

    fireEvent.click(screen.getByRole("button", { name: "Open src/a.ts in Files changed" }));
    expect(onOpenFile).toHaveBeenLastCalledWith("src/a.ts", null);
    await waitFor(() => expect(onOpenFile).toHaveBeenCalledTimes(2));
  });
});

// ------------------------------------------------------------ Risk Brief [T2]

const never = () => new Promise<Reply>(() => {});
const isOpenFileButton = (b: HTMLElement) => /^Open .* in Files changed$/.test(b.getAttribute("aria-label") ?? "");

describe("OverviewTab · confirm dialog (T2)", () => {
  beforeEach(() => {
    stubApi({ [GET]: { body: stateOf(briefWith()) }, [POST]: { body: stateOf(briefWith({ summary: "S2" })) } });
  });

  it("AC-56: Cancel closes the dialog and sends no POST", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: REFRESH }));
    expect(screen.getByText("Replace this brief?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Replace this brief?")).toBeNull();
    await settle();
    expect(posts()).toHaveLength(0);
    expect(screen.getByText("S")).toBeInTheDocument();
  });

  it("AC-56: Escape closes the dialog and sends no POST", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: REFRESH }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByText("Replace this brief?")).toBeNull();
    await settle();
    expect(posts()).toHaveLength(0);
  });
});

describe("OverviewTab · cost line (T2)", () => {
  it("AC-59: a null cost reads 'gpt-4.1 · —' and never '$0'", async () => {
    stubApi({ [GET]: { body: stateOf(briefWith({ generation: { ...GENERATION, cost_usd: null } })) } });
    renderTab();
    expect(await screen.findByText("gpt-4.1 · —")).toBeInTheDocument();
    expect(screen.queryByText(/\$0/)).toBeNull();
  });

  it("AC-58: a sub-cent cost keeps its decimals", async () => {
    stubApi({ [GET]: { body: stateOf(briefWith({ generation: { ...GENERATION, cost_usd: 0.0013 } })) } });
    renderTab();
    expect(await screen.findByText("gpt-4.1 · $0.0013")).toBeInTheDocument();
  });
});

describe("OverviewTab · banner and review (T2)", () => {
  beforeEach(() => {
    stubApi({ [GET]: { body: stateOf(briefWith()) } });
  });

  it("AC-28: with no review the banner has the summary and the refresh button only", async () => {
    renderTab({ reviews: [] });
    expect(await screen.findByText("S")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: REFRESH })).toBeInTheDocument();
    for (const absent of ["Request changes", "Approve", "Comment", "PR SCORE"]) {
      expect(screen.queryByText(absent), absent).toBeNull();
    }
    expect(screen.queryByText(/findings ·|\d+ findings/)).toBeNull();
  });

  it("A-33: the banner takes the first review that has a verdict, skipping one without", async () => {
    const noVerdict: ReviewRecord = { ...securityReview, id: "rv0", verdict: null, score: null, agent_name: "Skipped Agent" };
    const approved: ReviewRecord = {
      ...securityReview,
      id: "rv2",
      verdict: "approve",
      score: 91,
      agent_name: "General",
      findings: [],
    };
    renderTab({ reviews: [noVerdict, approved, securityReview] });
    expect(await screen.findByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("91")).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.queryByText("Skipped Agent")).toBeNull();
    expect(screen.queryByText("Security Reviewer")).toBeNull();
  });

  it("A-33: a dismissed CRITICAL is not a blocker", async () => {
    const dismissed: ReviewRecord = {
      ...securityReview,
      findings: [finding("crit", "CRITICAL", { dismissed_at: "2026-10-09T09:30:00.000Z" }), finding("warn", "WARNING")],
    };
    renderTab({ reviews: [dismissed] });
    expect(await screen.findByText("2 findings")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).toBeNull();
  });

  it("AC-27: the provenance mark explains where the parts come from", async () => {
    renderTab({ reviews: [securityReview] });
    expect(
      await screen.findByLabelText(
        "Verdict, findings and score come from the latest agent review; what / why / risks / review-focus come from the brief.",
      ),
    ).toBeInTheDocument();
  });
});

describe("OverviewTab · loading (T2)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("AC-25 / AC-60: a pending POST shows the status, an elapsed counter from the click, skeletons, and nothing to click twice", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubApi({ [GET]: { body: EMPTY_STATE }, [POST]: never });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Generate brief" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Generating brief…");
    expect(screen.getByText("0 s elapsed")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByText("3 s elapsed")).toBeInTheDocument();

    // Risk areas and Review focus are skeletons, not content or empty texts.
    const intent = screen.getByTestId("intent");
    expect(intent.querySelector(".skeleton")).not.toBeNull();
    expect(within(intent).queryByText("No notable risks flagged.")).toBeNull();
    const focus = screen.getByText("Review focus — read these first").closest("section")!;
    expect(focus.querySelector(".skeleton")).not.toBeNull();
    expect(within(focus).queryByText("No review focus items")).toBeNull();

    // Generate and refresh cannot be used: absent or disabled.
    const clickable = screen
      .queryAllByRole("button")
      .filter((b) => ["Generate brief", REFRESH].includes(b.getAttribute("aria-label") ?? b.textContent ?? ""));
    for (const b of clickable) expect(b).toBeDisabled();
    expect(posts()).toHaveLength(1);
  });

  it("AC-25: while a refresh is pending the old summary is replaced by the loading state and the refresh cannot start another POST", async () => {
    stubApi({ [GET]: { body: stateOf(briefWith()) }, [POST]: never });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: REFRESH }));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Generating brief…");
    for (const b of screen.queryAllByRole("button", { name: REFRESH })) {
      expect(b).toBeDisabled();
      fireEvent.click(b);
    }
    await settle();
    expect(posts()).toHaveLength(1);
  });

  it("AC-61: a generation this page did not start shows the loading state and no elapsed counter", async () => {
    stubApi({ [GET]: { body: stateOf(null, { generating: true }) } });
    renderTab();
    expect(await screen.findByRole("status")).toHaveTextContent("Generating brief…");
    expect(screen.queryByText(/elapsed/)).toBeNull();
    expect(posts()).toHaveLength(0);
  });
});

describe("OverviewTab · errors (T2)", () => {
  const fail = { status: 502, body: { error: { code: "bad_gateway", message: "Brief generation failed: boom" } } };

  it("AC-42: a failed generate shows an alert and the empty state stays", async () => {
    stubApi({ [GET]: { body: EMPTY_STATE }, [POST]: fail });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Generate brief" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not generate the brief: Brief generation failed: boom",
    );
    expect(screen.getByText("No brief yet")).toBeInTheDocument();
  });

  it("AC-42: a failed refresh shows the alert and the previous brief is still rendered", async () => {
    stubApi({ [GET]: { body: stateOf(briefWith()) }, [POST]: fail });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: REFRESH }));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not generate the brief: Brief generation failed: boom",
    );
    expect(screen.getByText("S")).toBeInTheDocument();
  });

  it("AC-43: a failed load with nothing cached shows the error, and Retry refetches", async () => {
    stubApi({ [GET]: { status: 500, body: { error: { code: "internal_error", message: "x" } } } });
    renderTab();
    expect(await screen.findByText("Could not load the brief.")).toBeInTheDocument();
    expect(screen.queryByText("No brief yet")).toBeNull();
    const before = requests.filter((k) => k === GET).length;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(requests.filter((k) => k === GET).length).toBe(before + 1));
  });

  it("AC-43: a failed refetch with a brief held keeps the brief and shows no load error", async () => {
    stubApi({ [GET]: { body: stateOf(briefWith()) } });
    const { queryClient } = renderTab();
    expect(await screen.findByText("S")).toBeInTheDocument();

    stubApi({ [GET]: { status: 500, body: { error: { code: "internal_error", message: "x" } } } });
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["pr-brief", "p1"] });
    });
    // query observers notify on a later tick: let the failed state reach the screen before asserting
    await settle();
    expect(requests.filter((k) => k === GET).length).toBe(1);
    expect(queryClient.getQueryState(["pr-brief", "p1"])?.status).toBe("error");
    expect(screen.getByText("S")).toBeInTheDocument();
    expect(screen.queryByText("Could not load the brief.")).toBeNull();
  });
});

describe("OverviewTab · degraded facts (T2)", () => {
  it("AC-44: a degraded blast and a degraded history each show their notice with the reason", async () => {
    stubApi({
      [GET]: {
        body: stateOf(
          briefWith({
            blast: { changed_symbols: [], downstream: [], summary: "", degraded: true, reason: "flag_off" },
            history: { history: [], degraded: true, reason: "github_unavailable" },
          }),
        ),
      },
    });
    renderTab();
    expect(
      await screen.findByText("Blast radius was incomplete when this brief was written (flag_off)."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("PR history was incomplete when this brief was written (github_unavailable)."),
    ).toBeInTheDocument();
  });

  it("AC-44: a complete brief shows neither notice", async () => {
    stubApi({ [GET]: { body: stateOf(briefWith()) } });
    renderTab();
    await screen.findByText("S");
    expect(screen.queryByText(/was incomplete when this brief was written/)).toBeNull();
  });
});

describe("OverviewTab · Risk areas (T2)", () => {
  it("AC-30: the why toggle shows the explanation and every ref, with aria-expanded true", async () => {
    stubApi({
      [GET]: {
        body: stateOf(
          briefWith({
            risks: {
              risks: [
                { kind: "security", title: "T", severity: "medium", file_refs: ["src/a.ts", "src/b.ts"], explanation: "E" },
              ],
            },
          }),
        ),
      },
    });
    renderTab();
    const why = await screen.findByRole("button", { name: "Why this is a risk" });
    expect(why).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("E")).toBeNull();

    fireEvent.click(why);
    expect(why).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("E")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open src/b.ts in Files changed" })).toBeInTheDocument();
    // the first ref is shown collapsed as well as in the expanded list
    expect(screen.getAllByRole("button", { name: "Open src/a.ts in Files changed" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Medium")).toBeInTheDocument();
  });

  it("AC-31: no risks reads 'No notable risks flagged.'", async () => {
    stubApi({ [GET]: { body: stateOf(briefWith({ risks: { risks: [] } })) } });
    renderTab();
    expect(await within(await screen.findByTestId("intent")).findByText("No notable risks flagged.")).toBeInTheDocument();
  });

  it("AC-29: a risk without a file shows its title and severity but no file button", async () => {
    stubApi({
      [GET]: {
        body: stateOf(
          briefWith({
            risks: { risks: [{ kind: "perf", title: "Slow", severity: "low", file_refs: [], explanation: "X" }] },
            review_focus: [],
          }),
        ),
      },
    });
    renderTab();
    const intent = await screen.findByTestId("intent");
    expect(await within(intent).findByText("Slow")).toBeInTheDocument();
    expect(within(intent).getByText("Low")).toBeInTheDocument();
    expect(within(intent).queryAllByRole("button").filter(isOpenFileButton)).toHaveLength(0);
  });
});

describe("OverviewTab · Review focus (T2)", () => {
  it("AC-33: with no items the panel shows its heading and 'No review focus items', and no count badge", async () => {
    stubApi({ [GET]: { body: stateOf(briefWith({ review_focus: [] })) } });
    renderTab();
    const heading = await screen.findByText("Review focus — read these first");
    expect(screen.getByText("No review focus items")).toBeInTheDocument();
    expect(heading.closest("section")!.textContent).not.toMatch(/\d/);
  });

  it("AC-38: a row whose file is not in the PR opens nothing and shows 'File not in this PR's diff'; opening a PR file clears it", async () => {
    stubApi({ [GET]: { body: stateOf(briefWith()) } });
    const { onOpenFile } = renderTab();
    expect(screen.queryByText("File not in this PR's diff")).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: "Open gone.ts:3 in Files changed" }));
    expect(onOpenFile).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("File not in this PR's diff");

    fireEvent.click(screen.getByRole("button", { name: "Open src/a.ts:12 in Files changed" }));
    expect(onOpenFile).toHaveBeenCalledWith("src/a.ts", 12);
    expect(screen.queryByText("File not in this PR's diff")).toBeNull();
  });

  it("NFR-10: rows are reachable by keyboard: native buttons that are not disabled", async () => {
    stubApi({ [GET]: { body: stateOf(briefWith()) } });
    renderTab();
    const row = await screen.findByRole("button", { name: "Open src/a.ts:12 in Files changed" });
    expect(row.tagName).toBe("BUTTON");
    expect(row).not.toBeDisabled();
    expect(row).toHaveAttribute("type", "button");
  });
});

describe("OverviewTab · model text is plain text (T2)", () => {
  it("NFR-5: markup and links in model-written strings render as literal characters", async () => {
    const hostile = "<img src=x> [a](http://x)";
    stubApi({
      [GET]: {
        body: stateOf(
          briefWith({
            summary: hostile,
            risks: {
              risks: [{ kind: "security", title: "<b>bold</b>", severity: "high", file_refs: [], explanation: "<a href=x>x</a>" }],
            },
            review_focus: [{ file: "src/a.ts", line: 12, reason: "<script>x</script>" }],
          }),
        ),
      },
    });
    const { container } = renderTab();
    expect(await screen.findByText(hostile)).toBeInTheDocument();
    expect(screen.getByText("<b>bold</b>")).toBeInTheDocument();
    expect(screen.getByText("— <script>x</script>")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Why this is a risk" }));
    expect(screen.getByText("<a href=x>x</a>")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });
});
