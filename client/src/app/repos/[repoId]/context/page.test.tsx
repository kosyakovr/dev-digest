import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import contextMessages from "../../../../../messages/en/context.json";

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: "r1",
    activeRepo: { id: "r1", full_name: "acme/payments-api", default_branch: "main" },
  }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import ProjectContextPage from "./page";

const doc = (path: string, tokens: number, source: string) => ({
  path,
  content: null,
  size: tokens * 4,
  updated_at: null,
  tokens,
  source,
  used_by: null,
});

/** Answer `fetch` by "METHOD /path?query"; anything unanswered is a 404 envelope. */
/** A route value is a JSON body (200) or a function returning `{ status, body }`. */
type Reply = { status?: number; body: unknown };
let requests: string[] = [];

function stubApi(routes: Record<string, unknown | (() => Reply)>) {
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
      const reply: Reply = typeof hit === "function" ? (hit as () => Reply)() : { body: hit };
      return new Response(JSON.stringify(reply.body), {
        status: reply.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
        <ProjectContextPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { queryClient };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Project Context page", () => {
  it("shows a selected doc's path, tokens, rendered markdown and how many agents use it", async () => {
    stubApi({
      "GET /context/sources": { folders: ["docs", "specs"] },
      "GET /repos/r1/context": [doc("specs/a.md", 3, "specs")],
      "GET /repos/r1/context/file?path=specs%2Fa.md": {
        ...doc("specs/a.md", 3, "specs"),
        content: "# Heading A",
        used_by: 3,
      },
    });
    renderPage();

    const item = await screen.findByRole("button", { name: /specs\/a\.md/ });
    const pathsBefore = screen.getAllByText("specs/a.md").length;
    const tokensBefore = screen.queryAllByText("≈ 3 tokens").length;
    expect(screen.queryByRole("heading", { name: "Heading A" })).not.toBeInTheDocument();

    fireEvent.click(item);

    expect(await screen.findByRole("heading", { name: "Heading A" })).toBeInTheDocument();
    expect(await screen.findByText("Used by 3 agents")).toBeInTheDocument();
    // The list already names the path and tokens; the pane adds its own copy of each.
    expect(screen.getAllByText("specs/a.md").length).toBeGreaterThan(pathsBefore);
    expect(screen.getAllByText("≈ 3 tokens").length).toBeGreaterThan(tokensBefore);
  });

  it("filters the list by a case-insensitive path substring", async () => {
    stubApi({
      "GET /context/sources": { folders: ["docs", "specs"] },
      "GET /repos/r1/context": [doc("specs/public-api.md", 3, "specs"), doc("docs/x.md", 1, "docs")],
    });
    renderPage();
    await screen.findByText("specs/public-api.md");
    expect(screen.getByText("docs/x.md")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), { target: { value: "API" } });

    expect(screen.getByText("specs/public-api.md")).toBeInTheDocument();
    expect(screen.queryByText("docs/x.md")).not.toBeInTheDocument();
  });
});

// ============================ T2: states, grouping, safety ============================

const SOURCES = { "GET /context/sources": { folders: ["docs", "specs"] } };
const failing = (status: number, message: string) => () => ({ status, body: { error: { code: "x", message } } });
const listRequests = () => requests.filter((k) => k === "GET /repos/r1/context");

describe("Project Context page — error and empty states", () => {
  it("a failed list shows 'Couldn’t load specs' and a Retry that asks again (AC-8)", async () => {
    stubApi({ ...SOURCES, "GET /repos/r1/context": failing(500, "Boom") });
    renderPage();

    expect(await screen.findByText("Couldn’t load specs")).toBeInTheDocument();
    expect(listRequests()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(listRequests()).toHaveLength(2));
  });

  it("still shows the error, with Retry, when a refetch fails over stale data (AC-8)", async () => {
    let fail = false;
    stubApi({
      ...SOURCES,
      "GET /repos/r1/context": () => (fail ? failing(500, "Boom")() : { body: [doc("specs/a.md", 3, "specs")] }),
    });
    const { queryClient } = renderPage();
    await screen.findByText("specs/a.md");

    fail = true;
    await queryClient.refetchQueries({ queryKey: ["context", "r1"] });

    expect(await screen.findByText("Couldn’t load specs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows the server's own message for a 422, e.g. not cloned yet (AC-46)", async () => {
    stubApi({ ...SOURCES, "GET /repos/r1/context": failing(422, "This repository has not been cloned yet.") });
    renderPage();

    expect(await screen.findByText("This repository has not been cloned yet.")).toBeInTheDocument();
    expect(screen.queryByText("Couldn’t load specs")).not.toBeInTheDocument();
  });

  it("an empty list says so and names the configured folders (AC-9)", async () => {
    stubApi({ ...SOURCES, "GET /repos/r1/context": [] });
    renderPage();

    expect(await screen.findByText("No documents found")).toBeInTheDocument();
    expect(screen.getByText(/No \.md files under docs, specs\./)).toBeInTheDocument();
  });
});

describe("Project Context page — grouping and badges", () => {
  const docs = [doc("specs/b.md", 1, "specs"), doc("docs/z.md", 1, "docs"), doc("docs/a.md", 1, "docs")];

  it("groups under source headings in source-name order, paths ascending, each item badged (AC-53, AC-54)", async () => {
    stubApi({ ...SOURCES, "GET /repos/r1/context": docs });
    renderPage();
    await screen.findByText("specs/b.md");

    const docsHead = screen.getByRole("heading", { name: "docs" });
    const specsHead = screen.getByRole("heading", { name: "specs" });
    const after = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const item = (p: string) => screen.getByRole("button", { name: new RegExp(p.replace(".", "\\.")) });

    expect(after(docsHead, item("docs/a.md"))).toBe(true);
    expect(after(item("docs/a.md"), item("docs/z.md"))).toBe(true);
    expect(after(item("docs/z.md"), specsHead)).toBe(true);
    expect(after(specsHead, item("specs/b.md"))).toBe(true);

    // The badge sits in the item next to the path.
    expect(within(item("specs/b.md")).getByText("specs")).toBeInTheDocument();
    expect(within(item("docs/a.md")).getByText("docs")).toBeInTheDocument();
  });

  it("a filter that matches only specs/ hides the docs heading (A-20)", async () => {
    stubApi({ ...SOURCES, "GET /repos/r1/context": docs });
    renderPage();
    await screen.findByText("specs/b.md");

    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), { target: { value: "specs/" } });

    expect(screen.queryByRole("heading", { name: "docs" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "specs" })).toBeInTheDocument();
  });
});

describe("Project Context page — safe rendering (NFR-3)", () => {
  it("renders a <script> in a doc as nothing executable", async () => {
    stubApi({
      ...SOURCES,
      "GET /repos/r1/context": [doc("specs/a.md", 3, "specs")],
      "GET /repos/r1/context/file?path=specs%2Fa.md": {
        ...doc("specs/a.md", 3, "specs"),
        content: "# Safe\n\n<script>window.__y=1</script>",
        used_by: 0,
      },
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /specs\/a\.md/ }));

    await screen.findByRole("heading", { name: "Safe" });
    expect(document.querySelector("script")).toBeNull();
    expect((window as unknown as { __y?: number }).__y).toBeUndefined();
  });
});
