import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import onboardingMessages from "../../../../../messages/en/onboarding.json";
import commonMessages from "../../../../../messages/en/common.json";
import shellMessages from "../../../../../messages/en/shell.json";

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/repos/r1/tour",
}));
vi.mock("@/lib/repo-context", () => {
  const repo = { id: "r1", full_name: "acme/payments-api", default_branch: "main", last_polled_at: null };
  return {
    useActiveRepo: () => ({
      repoId: "r1",
      repos: [repo],
      activeRepo: repo,
      setRepoId: vi.fn(),
      reposLoaded: true,
    }),
    useRepoNotFound: () => false,
  };
});
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import TourPage from "./page";

/**
 * Onboarding Tour page (L05) — plan WP7.tests [T1]. The page is driven through
 * the real hooks over a stubbed `fetch`, keyed "METHOD /path" (as the Project
 * Context page test does). Oracles are the spec's ACs and NFR-11 wording.
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

const GET = "GET /repos/r1/tour";
const POST = "POST /repos/r1/tour/generate";
const posts = () => requests.filter((k) => k === POST);
const never = () => new Promise<Reply>(() => {});

const section = (kind: string, title: string, body: string, extra: Record<string, unknown> = {}) => ({
  kind,
  title,
  body,
  diagram: null,
  links: [] as unknown[],
  ...extra,
});

const GENERATED_AT = "2026-10-08T10:00:00.000Z";

const llmTour = {
  sections: [
    section("architecture_overview", "Architecture overview", "Architecture body text."),
    section("critical_paths", "Critical paths", "Critical body text.", {
      links: [{ label: "src/app.ts", path: "src/app.ts", note: "Entry point" }],
    }),
    section("how_to_run", "How to run locally", "Run body text.", {
      steps: [{ command: "pnpm install", note: "Install the dependencies" }],
    }),
    section("guided_reading", "Guided reading path", "Reading body text.", {
      links: [{ label: "src/reading.ts", path: "src/reading.ts", note: "Start here" }],
    }),
    section("first_tasks", "First tasks", "Tasks body text.", {
      tasks: [{ title: "Add a test", scope: "src/app.ts", difficulty: "medium" }],
    }),
  ],
  source: "llm",
  index_status: "full",
  indexed_sha: "abc1234def",
  files_indexed: 42,
  generated_at: GENERATED_AT,
  model: "m/x",
  cost_usd: 0.001,
};

const skeletonTour = (reason: string, over: Record<string, unknown> = {}) => ({
  sections: [
    section("architecture_overview", "Architecture overview", "Architecture body text."),
    section("critical_paths", "Critical paths", "Critical body text.", {
      links: [{ label: "src/app.ts", path: "src/app.ts", note: "Imported by 3 files" }],
    }),
    section("how_to_run", "How to run locally", "Run body text.", { steps: [{ command: "pnpm install" }] }),
    section("guided_reading", "Guided reading path", "Reading body text.", {
      links: [{ label: "src/reading.ts", path: "src/reading.ts", note: "Imported by 2 files" }],
    }),
    section("first_tasks", "First tasks", ""),
  ],
  source: "skeleton",
  skeleton_reason: reason,
  index_status: "full",
  indexed_sha: "abc1234def",
  files_indexed: 42,
  generated_at: GENERATED_AT,
  model: null,
  cost_usd: null,
  ...over,
});

const stateOf = (tour: unknown, over: Record<string, unknown> = {}) => ({
  tour,
  generating: false,
  stale: false,
  current_indexed_sha: "abc1234def",
  ...over,
});

const EMPTY_STATE = { tour: null, generating: false, stale: false, current_indexed_sha: null };

// ------------------------------------------------------------------- helpers

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider
        locale="en"
        messages={{ onboarding: onboardingMessages, common: commonMessages, shell: shellMessages }}
      >
        <TourPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { queryClient };
}

/** The five collapsible section headers (the only buttons that carry `aria-expanded`). */
const headers = () => screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-expanded"));
const headerOf = (title: string) => {
  const h = headers().find((b) => (b.textContent ?? "").includes(title));
  if (!h) throw new Error(`no section header "${title}"`);
  return h;
};
/** The content region a header controls (NFR-9: `aria-controls`). */
const bodyOf = (title: string) => {
  const el = document.getElementById(headerOf(title).getAttribute("aria-controls") ?? "");
  if (!el) throw new Error(`header "${title}" controls no existing element`);
  return el;
};
/** The page-level Regenerate button (the only one while no notice or dialog is open). */
const pageRegenerate = () => screen.getByRole("button", { name: "Regenerate" });
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A text that must not be visible: removed from the DOM, or present but hidden. */
function expectHidden(text: string) {
  const el = screen.queryByText(text);
  if (el) expect(el).not.toBeVisible();
}

const scrollIntoView = vi.fn();
beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "clipboard");
});

// ------------------------------------------------------------ [T1] page states

describe("Onboarding Tour page — empty, loading and pending states", () => {
  it("with no tour shows the title, the NFR-11 body and a Generate button (AC-6)", async () => {
    stubApi({ [GET]: { body: EMPTY_STATE } });
    renderPage();

    const button = await screen.findByRole("button", { name: "Generate onboarding tour" });
    // The title is a second element with the same words, outside the button.
    expect(screen.getAllByText("Generate onboarding tour").some((el) => !el.closest("button"))).toBe(true);
    expect(
      screen.getByText(
        "DevDigest indexes the repo and writes a guided tour: architecture, critical paths, how to run, a reading order, and first tasks. Takes 30–60s and ~5,000 tokens.",
      ),
    ).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it("two rapid clicks on Generate send exactly one POST (AC-7)", async () => {
    stubApi({ [GET]: { body: EMPTY_STATE }, [POST]: never });
    renderPage();

    const button = await screen.findByRole("button", { name: "Generate onboarding tour" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(posts()).toHaveLength(1));
    await act(async () => {});
    expect(posts()).toHaveLength(1);
  });

  it("while its own POST is pending, disables the button, shows the hint and counts elapsed seconds (AC-21, AC-51)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubApi({ [GET]: { body: EMPTY_STATE }, [POST]: never });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Generate onboarding tour" }));

    const pending = await screen.findByRole("button", { name: "Generating…" });
    expect(pending).toBeDisabled();
    expect(screen.getByText("This usually takes 30–60 s.")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText("3 s elapsed")).toBeInTheDocument();
  });

  it("when the server reports generating, shows the pending state but no elapsed counter (AC-22, AC-52)", async () => {
    stubApi({ [GET]: { body: stateOf(llmTour, { generating: true }) } });
    renderPage();

    const pending = await screen.findByRole("button", { name: "Regenerating…" });
    expect(pending).toBeDisabled();
    expect(screen.getByText("This usually takes 30–60 s.")).toBeInTheDocument();
    expect(screen.queryByText(/elapsed/)).not.toBeInTheDocument();
  });

  it("shows the loading text while the first GET is in flight (AC-42)", async () => {
    stubApi({ [GET]: never });
    renderPage();

    expect(await screen.findByText("Loading onboarding tour…")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------- [T1] tour layout

describe("Onboarding Tour page — header and sections", () => {
  it("shows the header with file count, local time and model, and all five sections expanded (AC-26, AC-27)", async () => {
    stubApi({ [GET]: { body: stateOf(llmTour) } });
    renderPage();

    expect(await screen.findByText("Onboarding for acme/payments-api")).toBeInTheDocument();
    const when = new Date(GENERATED_AT).toLocaleString();
    expect(
      screen.getByText(new RegExp(escapeRe(`Generated from index of 42 files · last refreshed ${when} · m/x`))),
    ).toBeInTheDocument();

    expect(headers()).toHaveLength(5);
    for (const h of headers()) expect(h).toHaveAttribute("aria-expanded", "true");
    for (const body of [
      "Architecture body text.",
      "Critical body text.",
      "Run body text.",
      "Reading body text.",
      "Tasks body text.",
    ]) {
      expect(screen.getByText(body)).toBeVisible();
    }
  });

  it("collapses a section on its header and restores it on a second click; headers are real buttons (AC-28)", async () => {
    stubApi({ [GET]: { body: stateOf(llmTour) } });
    renderPage();
    await screen.findByText("Critical body text.");

    const header = headerOf("Critical paths");
    // A native <button> is what makes Enter and Space work in a browser.
    expect(header.tagName).toBe("BUTTON");

    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expectHidden("Critical body text.");
    const openLink = document.querySelector('a[href$="/src/app.ts"]');
    if (openLink) expect(openLink).not.toBeVisible();

    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Critical body text.")).toBeVisible();
    expect(document.querySelector('a[href$="/src/app.ts"]')).toBeVisible();
  });

  it("expands a collapsed section when its entry under 'On this page' is activated (AC-29)", async () => {
    stubApi({ [GET]: { body: stateOf(llmTour) } });
    renderPage();
    await screen.findByText("Tasks body text.");

    expect(screen.getByText("On this page")).toBeInTheDocument();
    const header = headerOf("First tasks");
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");

    const entries = [...screen.queryAllByRole("button"), ...screen.queryAllByRole("link")].filter(
      (el) => !el.hasAttribute("aria-expanded") && (el.textContent ?? "").includes("First tasks"),
    );
    expect(entries).toHaveLength(1);
    fireEvent.click(entries[0]!);

    expect(header).toHaveAttribute("aria-expanded", "true");
    // ...and the page scrolls to that section (the card that holds the header).
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect((scrollIntoView.mock.contexts[0] as Element).contains(header)).toBe(true);
  });

  it("links Open to the file on GitHub at the tour's SHA, in a new tab (AC-30)", async () => {
    stubApi({ [GET]: { body: stateOf(llmTour) } });
    renderPage();
    await screen.findByText("Critical body text.");

    const link = document.querySelector(
      'a[href="https://github.com/acme/payments-api/blob/abc1234def/src/app.ts"]',
    );
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows a task card with its title, scope and difficulty as text (AC-33)", async () => {
    stubApi({ [GET]: { body: stateOf(llmTour) } });
    renderPage();
    await screen.findByText("Tasks body text.");

    const tasks = within(bodyOf("First tasks"));
    expect(tasks.getByText("Add a test")).toBeInTheDocument();
    expect(tasks.getByText("src/app.ts")).toBeInTheDocument();
    expect(tasks.getByText("Medium complexity")).toBeInTheDocument();
  });

  it("shows the empty-section text for a section with no links (AC-41)", async () => {
    const tour = {
      ...llmTour,
      sections: llmTour.sections.map((s) =>
        s.kind === "critical_paths" ? { ...s, body: "", links: [] } : s,
      ),
    };
    stubApi({ [GET]: { body: stateOf(tour) } });
    renderPage();
    await screen.findByText("Tasks body text.");

    expect(within(bodyOf("Critical paths")).getByText("The index has nothing for this section.")).toBeInTheDocument();
    // The sections that do have items do not claim to be empty.
    expect(within(bodyOf("Guided reading path")).queryByText("The index has nothing for this section.")).toBeNull();
  });
});

// ------------------------------------------------------------- [T1] copy step

describe("Onboarding Tour page — copying a run step", () => {
  it("writes exactly the command, shows 'Copied!' and hides it after 2 s (AC-34, AC-35)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    stubApi({ [GET]: { body: stateOf(llmTour) } });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Copy command: pnpm install" }));

    expect(await screen.findByText("Copied!")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("pnpm install");

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("Copied!")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
  });
});

// ------------------------------------------------------- [T1] notices (status)

describe("Onboarding Tour page — notices", () => {
  const SKELETON_NOTICES: Array<[string, Record<string, unknown>, string]> = [
    [
      "llm_unavailable",
      {},
      "Skeleton only — no API key is set for the onboarding model. Add one in Settings → API Keys, then Regenerate.",
    ],
    ["llm_failed", {}, "Skeleton only — the model call failed. Regenerate to try again."],
    ["llm_timeout", {}, "Skeleton only — the model did not answer within 120 s. Regenerate to try again."],
    [
      "index_unavailable",
      { index_status: "failed", index_reason: "repo_too_large", indexed_sha: "", files_indexed: 0 },
      "Skeleton only — the repository index is unavailable (the repository is too large to index). Re-index the repository, then Regenerate.",
    ],
  ];

  it.each(SKELETON_NOTICES)(
    "a skeleton tour with reason %s shows its notice in a status region with a Regenerate button (AC-37)",
    async (reason, over, text) => {
      stubApi({ [GET]: { body: stateOf(skeletonTour(reason, over)) } });
      renderPage();

      const notice = (await screen.findByText(text)).closest('[role="status"]') as HTMLElement | null;
      expect(notice).not.toBeNull();
      expect(within(notice!).getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
    },
  );

  it("a skeleton tour's First tasks says the model writes them and shows no task card (AC-13)", async () => {
    stubApi({ [GET]: { body: stateOf(skeletonTour("llm_failed")) } });
    renderPage();

    expect(
      await screen.findByText("First tasks are written by the model. Regenerate once the model is available."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/complexity/i)).not.toBeInTheDocument();
  });

  it("a partial index shows the partial notice (AC-38)", async () => {
    stubApi({ [GET]: { body: stateOf({ ...llmTour, index_status: "partial", index_reason: "index_partial" }) } });
    renderPage();

    const text =
      "The index is partial — some files were skipped, so this tour may miss parts of the repository.";
    const notice = (await screen.findByText(text)).closest('[role="status"]');
    expect(notice).not.toBeNull();
  });

  it("a stale tour shows both SHAs in short form and keeps the tour's SHA in Open links (AC-40)", async () => {
    stubApi({ [GET]: { body: stateOf(llmTour, { stale: true, current_indexed_sha: "9876543210" }) } });
    renderPage();

    const text =
      "Out of date — the index moved from abc1234 to 9876543 after this tour was generated. Regenerate to update it.";
    const notice = (await screen.findByText(text)).closest('[role="status"]');
    expect(notice).not.toBeNull();
    expect(document.querySelector('a[href*="/blob/abc1234def/"]')).not.toBeNull();
    expect(document.querySelector('a[href*="/blob/9876543"]')).toBeNull();
  });
});

// ------------------------------------------------- [T1] Regenerate confirmation

describe("Onboarding Tour page — Regenerate over a model-written tour", () => {
  const DIALOG_BODY =
    "Regenerating makes one model call on your API key and replaces the current tour. Takes 30–60s and ~5,000 tokens.";

  async function openDialog() {
    stubApi({ [GET]: { body: stateOf(llmTour) }, [POST]: { body: stateOf(llmTour) } });
    renderPage();
    await screen.findByText("Tasks body text.");
    const pageButton = pageRegenerate();
    fireEvent.click(pageButton);
    const dialog = await screen.findByRole("dialog");
    return { pageButton, dialog };
  }

  it("asks first, sends nothing, and POSTs once only when the dialog's Regenerate is confirmed (AC-49)", async () => {
    const { pageButton, dialog } = await openDialog();

    expect(within(dialog).getByText("Replace this onboarding tour?")).toBeInTheDocument();
    expect(within(dialog).getByText(DIALOG_BODY)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(posts()).toHaveLength(0);

    const confirm = within(dialog).getByRole("button", { name: "Regenerate" });
    expect(confirm).not.toBe(pageButton);
    fireEvent.click(confirm);

    await waitFor(() => expect(posts()).toHaveLength(1));
    await act(async () => {});
    expect(posts()).toHaveLength(1);
  });

  it("Cancel closes the dialog, sends nothing and returns focus to the page's Regenerate button (AC-50)", async () => {
    const { pageButton, dialog } = await openDialog();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Replace this onboarding tour?")).not.toBeInTheDocument();
    expect(posts()).toHaveLength(0);
    expect(document.activeElement).toBe(pageButton);
  });

  it("Escape closes the dialog, sends nothing and returns focus to the page's Regenerate button (AC-50)", async () => {
    const { pageButton, dialog } = await openDialog();

    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(posts()).toHaveLength(0);
    expect(document.activeElement).toBe(pageButton);
  });

  it("over a skeleton tour Regenerate sends one POST at once, with no dialog (AC-7)", async () => {
    stubApi({ [GET]: { body: stateOf(skeletonTour("llm_failed")) }, [POST]: never });
    renderPage();
    await screen.findByText("Architecture body text.");

    // The notice and the header both offer Regenerate; either one starts it.
    fireEvent.click(screen.getAllByRole("button", { name: "Regenerate" })[0]!);

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

// ======================== [T2]: unwanted behaviour, edges, safety ========================

const withSection = (kind: string, over: Record<string, unknown>) => ({
  ...llmTour,
  sections: llmTour.sections.map((s) => (s.kind === kind ? { ...s, ...over } : s)),
});

describe("Onboarding Tour page — diagram and Share link", () => {
  it("an invalid diagram keeps the section text and draws no diagram or error graphic (AC-31)", async () => {
    stubApi({ [GET]: { body: stateOf(withSection("architecture_overview", { diagram: "this is not a diagram" })) } });
    renderPage();
    await screen.findByText("Architecture body text.");
    // Give an async diagram renderer the chance to (wrongly) draw something.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const body = bodyOf("Architecture overview");
    expect(within(body).getByText("Architecture body text.")).toBeVisible();
    expect(body.querySelector("svg")).toBeNull();
    expect(body).not.toHaveTextContent(/syntax error|parse error|error/i);
  });

  it("has no Share link control (AC-32)", async () => {
    stubApi({ [GET]: { body: stateOf(llmTour) } });
    renderPage();
    await screen.findByText("Tasks body text.");

    expect(screen.queryByRole("button", { name: /share link/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /share link/i })).toBeNull();
    expect(screen.queryByText(/share link/i)).toBeNull();
  });
});

describe("Onboarding Tour page — copy failure (AC-36)", () => {
  const FAILED = "Couldn’t copy — select the command and copy it by hand.";

  it("shows the fallback text when there is no clipboard", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    stubApi({ [GET]: { body: stateOf(llmTour) } });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Copy command: pnpm install" }));

    expect(await screen.findByText(FAILED)).toBeInTheDocument();
    expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
  });

  it("shows the fallback text when the write is rejected", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    stubApi({ [GET]: { body: stateOf(llmTour) } });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Copy command: pnpm install" }));

    expect(await screen.findByText(FAILED)).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith("pnpm install");
    expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
  });

  it("does not show the fallback text after a successful copy", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    stubApi({ [GET]: { body: stateOf(llmTour) } });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Copy command: pnpm install" }));

    await screen.findByText("Copied!");
    expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
  });
});

describe("Onboarding Tour page — load errors (AC-43, A-31)", () => {
  const LOAD_ERROR = "Couldn’t load the onboarding tour";
  const failing = (status: number, message: string) => () => ({ status, body: { error: { code: "x", message } } });
  const gets = () => requests.filter((k) => k === GET);

  it("a 500 shows the load error with a Retry that asks again", async () => {
    stubApi({ [GET]: failing(500, "Boom") });
    renderPage();

    expect(await screen.findByText(LOAD_ERROR)).toBeInTheDocument();
    expect(gets()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(gets()).toHaveLength(2));
  });

  it("still shows the load error and Retry when a refetch fails over stale data", async () => {
    let fail = false;
    stubApi({ [GET]: () => (fail ? failing(500, "Boom")() : { body: stateOf(llmTour) }) });
    const { queryClient } = renderPage();
    await screen.findByText("Tasks body text.");

    fail = true;
    await queryClient.refetchQueries({ queryKey: ["onboarding-tour", "r1"] });

    expect(await screen.findByText(LOAD_ERROR)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("a 404 shows 'Repository not found' and no Retry", async () => {
    stubApi({ [GET]: failing(404, "Repository not found") });
    renderPage();

    expect(await screen.findByText("Repository not found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByText(LOAD_ERROR)).not.toBeInTheDocument();
  });
});

describe("Onboarding Tour page — untrusted model text (NFR-7, A-2)", () => {
  it("renders no raw HTML element, no image and no javascript: link from a section body", async () => {
    const body =
      "<img src=x onerror=alert(1)> ![a](https://e/x) [bad](javascript:alert(1)) <b>raw</b> [ok](https://example.com/docs)";
    stubApi({ [GET]: { body: stateOf(withSection("architecture_overview", { body })) } });
    renderPage();
    await screen.findByText("Tasks body text.");

    const arch = bodyOf("Architecture overview");
    expect(document.querySelector("img")).toBeNull();
    expect(arch.querySelector("b")).toBeNull();
    for (const a of Array.from(document.querySelectorAll("a"))) {
      expect(a.getAttribute("href") ?? "").not.toMatch(/^\s*javascript:/i);
    }
    // A plain https link still works, and opens safely.
    const ok = within(arch).getByRole("link", { name: "ok" });
    expect(ok).toHaveAttribute("href", "https://example.com/docs");
    expect(ok).toHaveAttribute("target", "_blank");
    expect(ok.getAttribute("rel")).toMatch(/noopener/);
  });

  it("shows file and step notes as plain text", async () => {
    const tour = {
      ...withSection("critical_paths", {
        links: [{ label: "src/app.ts", path: "src/app.ts", note: "**bold** <i>italic</i>" }],
      }),
    };
    stubApi({ [GET]: { body: stateOf(tour) } });
    renderPage();

    expect(await screen.findByText("**bold** <i>italic</i>")).toBeInTheDocument();
    expect(bodyOf("Critical paths").querySelector("i, strong")).toBeNull();
  });
});

describe("Onboarding Tour page — accessibility (NFR-9)", () => {
  it("every section header controls an element that exists, with its own id", async () => {
    stubApi({ [GET]: { body: stateOf(llmTour) } });
    renderPage();
    await screen.findByText("Tasks body text.");

    const ids = headers().map((h) => h.getAttribute("aria-controls"));
    expect(ids.every((id) => !!id)).toBe(true);
    expect(new Set(ids).size).toBe(5);
    for (const id of ids) expect(document.getElementById(id!)).not.toBeNull();
  });

  it("keeps the elapsed counter out of any live region", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubApi({ [GET]: { body: stateOf(llmTour) }, [POST]: never });
    renderPage();
    await screen.findByText("Tasks body text.");

    fireEvent.click(pageRegenerate());
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Regenerate" }));
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    const counter = await screen.findByText(/\d+ s elapsed/);
    expect(counter.closest('[role="status"], [aria-live]')).toBeNull();
  });
});

