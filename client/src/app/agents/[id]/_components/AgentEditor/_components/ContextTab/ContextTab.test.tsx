import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import agentMessages from "../../../../../../../../messages/en/agents.json";
import contextMessages from "../../../../../../../../messages/en/context.json";
import { ToastProvider } from "@/lib/toast";

// The editor reads the active repo for the doc list; every other piece of data
// comes from the real hooks, answered by a fetch stub keyed on method + URL.
const repo = vi.hoisted(() => ({ id: "r1" as string | null }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: repo.id,
    activeRepo: repo.id ? { id: repo.id, full_name: "acme/payments-api", default_branch: "main" } : null,
  }),
  useRepoNotFound: () => false,
}));

import { ContextTab } from "./ContextTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

type Item = { path: string; position: number | null };
type Inherited = { skill_id: string; skill_name: string; items: Item[] };

/** A listed doc as `GET /repos/:id/context` returns it (content is null on the list). */
const doc = (path: string, tokens: number) => ({
  path,
  content: null,
  size: tokens * 4,
  updated_at: null,
  tokens,
  source: path.split("/").find((seg) => seg === "docs" || seg === "specs") ?? null,
  used_by: null,
});

interface Call {
  method: string;
  key: string;
  body: unknown;
}
let calls: Call[] = [];

/** Answer `fetch` by "METHOD /path?query"; anything unanswered is a 404 envelope. */
function stubApi(routes: Record<string, unknown | ((body: unknown) => { status?: number; body: unknown })>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = (init?.method ?? "GET").toUpperCase();
      const key = `${method} ${url.pathname}${url.search}`;
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, key, body });
      const hit = routes[key];
      if (hit === undefined) {
        return new Response(JSON.stringify({ error: { code: "not_found", message: `no stub for ${key}` } }), {
          status: 404,
        });
      }
      const out = typeof hit === "function" ? (hit as (b: unknown) => { status?: number; body: unknown })(body) : { body: hit };
      return new Response(JSON.stringify(out.body), {
        status: out.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

const putCalls = () => calls.filter((c) => c.method === "PUT" && c.key === "PUT /agents/ag1/context");

/** While true, the doc list request fails with a 500 whose message is "Boom". */
let listFails = false;

function renderTab(opts: {
  items: Item[];
  docs: ReturnType<typeof doc>[];
  inherited?: Inherited[];
  extra?: Record<string, unknown>;
  putResponse?: (body: unknown) => { status?: number; body: unknown };
}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  stubApi({
    "GET /context/sources": { folders: ["docs", "specs"] },
    "GET /repos/r1/context": () =>
      listFails ? { status: 500, body: { error: { code: "internal", message: "Boom" } } } : { body: opts.docs },
    "GET /agents/ag1/context": { items: opts.items, inherited: opts.inherited ?? [] },
    "PUT /agents/ag1/context":
      opts.putResponse ??
      ((body: unknown) => ({ body: { items: (body as { items: Item[] }).items, inherited: opts.inherited ?? [] } })),
    ...(opts.extra ?? {}),
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={{ agents: agentMessages, context: contextMessages }}>
        <ToastProvider>
          <ContextTab agent={AGENT} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));
const savedItems = () => putCalls()[0]!.body as { items: Item[] };

const row = (path: string) => screen.getByRole("listitem", { name: path });
const order = () => screen.getAllByRole("listitem").map((li) => li.getAttribute("aria-label"));
const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  calls = [];
  listFails = false;
  repo.id = "r1";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Agent Context tab — row order and ticking", () => {
  it("lists the positioned rows by position, above the first source group", async () => {
    // docs/c.md is unpositioned, so a "docs" group exists for the block to precede.
    renderTab({
      items: [
        { path: "specs/b.md", position: 1 },
        { path: "specs/a.md", position: 0 },
      ],
      docs: [doc("specs/a.md", 3), doc("specs/b.md", 5), doc("docs/c.md", 2)],
    });

    await screen.findByRole("listitem", { name: "docs/c.md" });
    expect(order().slice(0, 2)).toEqual(["specs/a.md", "specs/b.md"]);
    expect(follows(row("specs/b.md"), screen.getByRole("heading", { name: "docs" }))).toBe(true);
  });

  it("ticking a row keeps it in its source group and saves it with no position", async () => {
    renderTab({
      items: [],
      docs: [doc("docs/b.md", 1), doc("docs/c.md", 1), doc("docs/d.md", 1)],
    });
    await screen.findByRole("listitem", { name: "docs/c.md" });

    fireEvent.click(screen.getByRole("checkbox", { name: "Attach docs/c.md" }));

    expect(order()).toEqual(["docs/b.md", "docs/c.md", "docs/d.md"]);
    expect(follows(screen.getByRole("heading", { name: "docs" }), row("docs/c.md"))).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(putCalls()[0]!.body).toEqual({ items: [{ path: "docs/c.md", position: null }] });
  });
});

describe("Agent Context tab — drag to reorder", () => {
  it("dropping the last block row on the first row moves it to the top", async () => {
    renderTab({
      items: [
        { path: "specs/a.md", position: 0 },
        { path: "specs/b.md", position: 1 },
        { path: "specs/c.md", position: 2 },
      ],
      docs: [doc("specs/a.md", 1), doc("specs/b.md", 1), doc("specs/c.md", 1)],
    });
    await screen.findByRole("listitem", { name: "specs/c.md" });
    expect(order()).toEqual(["specs/a.md", "specs/b.md", "specs/c.md"]);

    fireEvent.dragStart(row("specs/c.md"));
    fireEvent.dragOver(row("specs/a.md"));
    fireEvent.drop(row("specs/a.md"));

    expect(order()).toEqual(["specs/c.md", "specs/a.md", "specs/b.md"]);
  });
});

describe("Agent Context tab — saving", () => {
  it("sends exactly one PUT and confirms with a toast", async () => {
    renderTab({
      items: [{ path: "specs/a.md", position: null }],
      docs: [doc("specs/a.md", 3)],
    });
    await screen.findByRole("listitem", { name: "specs/a.md" });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Context saved")).toBeInTheDocument();
    expect(putCalls()).toHaveLength(1);
    expect(putCalls()[0]!.body).toEqual({ items: [{ path: "specs/a.md", position: null }] });
  });
});

describe("Agent Context tab — token counts and the soft cap", () => {
  it("shows each row's tokens and their total, with no cap badge under 4K", async () => {
    renderTab({
      items: [
        { path: "specs/a.md", position: 0 },
        { path: "specs/b.md", position: 1 },
      ],
      docs: [doc("specs/a.md", 3), doc("specs/b.md", 5)],
    });

    expect(await screen.findByText("≈ 3 tokens")).toBeInTheDocument();
    expect(screen.getByText("≈ 5 tokens")).toBeInTheDocument();
    expect(screen.getByText("≈ 8 tokens")).toBeInTheDocument();
    expect(screen.queryByText("over 4K soft cap")).not.toBeInTheDocument();
  });

  it("flags a total over 4,000 tokens", async () => {
    renderTab({
      items: [{ path: "specs/big.md", position: null }],
      docs: [doc("specs/big.md", 4001)],
    });

    expect(await screen.findByText("over 4K soft cap")).toBeInTheDocument();
  });
});

describe("Agent Context tab — preview drawer", () => {
  it("opens a drawer with the path, tokens, rendered markdown and an Attach button", async () => {
    renderTab({
      items: [],
      docs: [doc("specs/a.md", 3)],
      extra: {
        "GET /repos/r1/context/file?path=specs%2Fa.md": {
          ...doc("specs/a.md", 3),
          content: "# Title",
          used_by: 0,
        },
      },
    });
    await screen.findByRole("listitem", { name: "specs/a.md" });

    fireEvent.click(within(row("specs/a.md")).getByRole("button", { name: "Preview" }));

    const drawer = await screen.findByRole("dialog");
    expect(await within(drawer).findByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(within(drawer).getAllByText("specs/a.md").length).toBeGreaterThan(0);
    expect(within(drawer).getByText("≈ 3 tokens")).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Attach" })).toBeInTheDocument();
  });
});

describe("Agent Context tab — inherited docs", () => {
  it("summarises the documents inherited from skills", async () => {
    renderTab({
      items: [],
      docs: [doc("docs/s.md", 4), doc("docs/t.md", 6)],
      inherited: [
        {
          skill_id: "sk1",
          skill_name: "Sec",
          items: [
            { path: "docs/s.md", position: null },
            { path: "docs/t.md", position: null },
          ],
        },
      ],
    });

    expect(await screen.findByText(/Inherited from skills: 2 documents/)).toBeInTheDocument();
  });
});

// ============================ T2: edges ============================

describe("Agent Context tab — soft cap with inherited docs (R-14, REC-2)", () => {
  it("counts an inherited-only doc: own 3,900 + inherited 200 reads ≈ 4,100 and is over the cap", async () => {
    renderTab({
      items: [{ path: "docs/own.md", position: null }],
      docs: [doc("docs/own.md", 3900), doc("docs/inh.md", 200)],
      inherited: [{ skill_id: "sk1", skill_name: "Sec", items: [{ path: "docs/inh.md", position: null }] }],
    });

    expect(await screen.findByText("≈ 4,100 tokens")).toBeInTheDocument();
    expect(screen.getByText("over 4K soft cap")).toBeInTheDocument();
  });

  it("counts an inherited doc that is also attached directly once", async () => {
    renderTab({
      items: [
        { path: "docs/own.md", position: null },
        { path: "docs/inh.md", position: null },
      ],
      docs: [doc("docs/own.md", 3500), doc("docs/inh.md", 300)],
      inherited: [{ skill_id: "sk1", skill_name: "Sec", items: [{ path: "docs/inh.md", position: null }] }],
    });

    // 3,500 + 300 = 3,800 once; counted twice it would be 4,100 and over the cap.
    expect(await screen.findByText("≈ 3,800 tokens")).toBeInTheDocument();
    expect(screen.queryByText("over 4K soft cap")).not.toBeInTheDocument();
  });
});

describe("Agent Context tab — the filter locks reordering (AC-14)", () => {
  it("makes rows undraggable, disables Move and explains why", async () => {
    renderTab({
      items: [
        { path: "specs/a.md", position: 0 },
        { path: "specs/b.md", position: 1 },
      ],
      docs: [doc("specs/a.md", 1), doc("specs/b.md", 1), doc("docs/c.md", 1)],
    });
    await screen.findByRole("listitem", { name: "docs/c.md" });
    expect(row("specs/a.md").getAttribute("draggable")).toBe("true");
    expect(screen.queryByText("Clear the filter to reorder.")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), { target: { value: "specs" } });

    expect(screen.getByText("Clear the filter to reorder.")).toBeInTheDocument();
    expect(order()).toEqual(["specs/a.md", "specs/b.md"]);
    for (const li of screen.getAllByRole("listitem")) expect(li.getAttribute("draggable")).not.toBe("true");
    for (const b of screen.queryAllByRole("button", { name: /^Move / })) expect(b).toBeDisabled();

    // A drop is ignored while the filter is on.
    fireEvent.dragStart(row("specs/b.md"));
    fireEvent.drop(row("specs/a.md"));
    expect(order()).toEqual(["specs/a.md", "specs/b.md"]);
  });
});

describe("Agent Context tab — a doc missing from the repo (AC-23, AC-56, AC-69)", () => {
  it('reads "Not found in <repo>" with no tokens or badge, keeps its checkbox, and is not in the total', async () => {
    renderTab({
      items: [{ path: "specs/gone.md", position: null }],
      docs: [doc("specs/a.md", 7)],
    });

    const gone = await screen.findByRole("listitem", { name: "specs/gone.md" });
    expect(within(gone).getByText("Not found in acme/payments-api")).toBeInTheDocument();
    expect(within(gone).queryByText(/tokens/)).not.toBeInTheDocument();
    expect(within(gone).queryByText("specs")).not.toBeInTheDocument();
    expect(within(gone).getByRole("checkbox", { name: "Attach specs/gone.md" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("≈ 0 tokens")).toBeInTheDocument();
  });

  it("renders an unpositioned not-found path after the last group", async () => {
    renderTab({
      items: [{ path: "docs/gone.md", position: null }],
      docs: [doc("docs/a.md", 1), doc("specs/b.md", 1)],
    });
    await screen.findByRole("listitem", { name: "docs/gone.md" });
    expect(order()).toEqual(["docs/a.md", "specs/b.md", "docs/gone.md"]);
  });
});

describe("Agent Context tab — no repository (AC-25)", () => {
  it("lists the attached paths without tokens and hints to add a repository", async () => {
    repo.id = null;
    renderTab({
      items: [
        { path: "specs/a.md", position: 0 },
        { path: "docs/b.md", position: null },
      ],
      docs: [],
    });

    await screen.findByRole("listitem", { name: "specs/a.md" });
    expect(screen.getByText("Add a repository to see its documents and token counts.")).toBeInTheDocument();
    for (const path of ["specs/a.md", "docs/b.md"]) {
      expect(within(row(path)).queryByText(/tokens/)).not.toBeInTheDocument();
    }
    expect(calls.some((c) => c.key.startsWith("GET /repos/"))).toBe(false);
  });
});

describe("Agent Context tab — the list request fails (R-10)", () => {
  const items = [
    { path: "specs/a.md", position: 0 },
    { path: "docs/b.md", position: null },
  ];

  it("shows the error and still lists the attached rows, with no tokens", async () => {
    listFails = true;
    renderTab({ items, docs: [doc("specs/a.md", 3), doc("docs/b.md", 4)] });

    expect(await screen.findByText("Boom")).toBeInTheDocument();
    expect(await screen.findByRole("listitem", { name: "specs/a.md" })).toBeInTheDocument();
    expect(row("docs/b.md")).toBeInTheDocument();
    expect(within(row("specs/a.md")).queryByText(/tokens/)).not.toBeInTheDocument();
  });

  it("does the same when a refetch fails and stale data is still cached", async () => {
    const { queryClient } = renderTab({ items, docs: [doc("specs/a.md", 3), doc("docs/b.md", 4)] });
    expect(await screen.findByText("≈ 3 tokens")).toBeInTheDocument();

    listFails = true;
    await queryClient.refetchQueries({ queryKey: ["context", "r1"] });

    expect(await screen.findByText("Boom")).toBeInTheDocument();
    expect(row("specs/a.md")).toBeInTheDocument();
    expect(row("docs/b.md")).toBeInTheDocument();
  });
});

describe("Agent Context tab — reordering rules (AC-62 to AC-68)", () => {
  it("dropping an attached grouped row on the first row after the block makes it the last block row", async () => {
    renderTab({
      items: [
        { path: "specs/a.md", position: 0 },
        { path: "docs/e.md", position: null },
      ],
      docs: [doc("specs/a.md", 1), doc("docs/d.md", 1), doc("docs/e.md", 1)],
    });
    await screen.findByRole("listitem", { name: "docs/e.md" });
    expect(order()).toEqual(["specs/a.md", "docs/d.md", "docs/e.md"]);

    fireEvent.dragStart(row("docs/e.md"));
    fireEvent.drop(row("docs/d.md"));
    expect(order()).toEqual(["specs/a.md", "docs/e.md", "docs/d.md"]);

    save();
    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(savedItems().items).toEqual([
      { path: "specs/a.md", position: 0 },
      { path: "docs/e.md", position: 1 },
    ]);
  });

  it("dropping a block row on a lower row returns it to its source group with no position", async () => {
    renderTab({
      items: [{ path: "specs/a.md", position: 0 }],
      docs: [doc("specs/a.md", 1), doc("docs/d.md", 1), doc("docs/e.md", 1)],
    });
    await screen.findByRole("listitem", { name: "docs/e.md" });

    fireEvent.dragStart(row("specs/a.md"));
    fireEvent.drop(row("docs/e.md"));

    expect(order()).toEqual(["docs/d.md", "docs/e.md", "specs/a.md"]);
    expect(follows(row("docs/e.md"), screen.getByRole("heading", { name: "specs" }))).toBe(true);

    save();
    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(savedItems().items).toEqual([{ path: "specs/a.md", position: null }]);
  });

  it("moving the last row up twice and saving sends c:0, a:1, b:2", async () => {
    renderTab({
      items: [
        { path: "specs/a.md", position: 0 },
        { path: "specs/b.md", position: 1 },
        { path: "specs/c.md", position: 2 },
      ],
      docs: [doc("specs/a.md", 1), doc("specs/b.md", 1), doc("specs/c.md", 1)],
    });
    await screen.findByRole("listitem", { name: "specs/c.md" });

    fireEvent.click(screen.getByRole("button", { name: "Move specs/c.md up" }));
    fireEvent.click(screen.getByRole("button", { name: "Move specs/c.md up" }));
    expect(order()).toEqual(["specs/c.md", "specs/a.md", "specs/b.md"]);

    save();
    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(savedItems().items).toEqual([
      { path: "specs/c.md", position: 0 },
      { path: "specs/a.md", position: 1 },
      { path: "specs/b.md", position: 2 },
    ]);
  });

  it("an unattached row has no Move buttons and cannot be dragged", async () => {
    renderTab({ items: [], docs: [doc("docs/z.md", 1)] });
    const z = await screen.findByRole("listitem", { name: "docs/z.md" });

    expect(z.getAttribute("draggable")).not.toBe("true");
    expect(screen.queryByRole("button", { name: "Move docs/z.md up" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move docs/z.md down" })).not.toBeInTheDocument();
  });

  it("unticking then ticking a block row puts it back under its source heading with no position", async () => {
    renderTab({
      items: [{ path: "specs/a.md", position: 0 }],
      docs: [doc("specs/a.md", 1), doc("docs/b.md", 1)],
    });
    await screen.findByRole("listitem", { name: "docs/b.md" });
    const box = () => screen.getByRole("checkbox", { name: "Attach specs/a.md" });

    fireEvent.click(box());
    fireEvent.click(box());

    expect(follows(screen.getByRole("heading", { name: "specs" }), row("specs/a.md"))).toBe(true);
    expect(box()).toHaveAttribute("aria-checked", "true");
    save();
    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(savedItems().items).toEqual([{ path: "specs/a.md", position: null }]);
  });

  it("Move up on an attached unpositioned row appends it to the block; Move down on the last block row sends it back", async () => {
    renderTab({
      items: [
        { path: "specs/a.md", position: 0 },
        { path: "docs/u.md", position: null },
      ],
      docs: [doc("specs/a.md", 1), doc("docs/u.md", 1)],
    });
    await screen.findByRole("listitem", { name: "docs/u.md" });

    // Disabled where the rules say so.
    expect(screen.getByRole("button", { name: "Move specs/a.md up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move docs/u.md down" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Move docs/u.md up" }));
    expect(order()).toEqual(["specs/a.md", "docs/u.md"]);
    expect(screen.getByRole("button", { name: "Move docs/u.md down" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Move docs/u.md down" }));
    expect(follows(screen.getByRole("heading", { name: "docs" }), row("docs/u.md"))).toBe(true);

    save();
    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(savedItems().items).toEqual([
      { path: "specs/a.md", position: 0 },
      { path: "docs/u.md", position: null },
    ]);
  });

  it("orders the manual row, then the docs group, then the specs group", async () => {
    renderTab({
      items: [
        { path: "specs/b.md", position: 0 },
        { path: "specs/a.md", position: null },
      ],
      docs: [doc("specs/a.md", 1), doc("specs/b.md", 1), doc("docs/z.md", 1)],
    });
    await screen.findByRole("listitem", { name: "docs/z.md" });

    const docsHead = screen.getByRole("heading", { name: "docs" });
    const specsHead = screen.getByRole("heading", { name: "specs" });
    const chain = [row("specs/b.md"), docsHead, row("docs/z.md"), specsHead, row("specs/a.md")];
    for (let i = 0; i < chain.length - 1; i++) expect(follows(chain[i]!, chain[i + 1]!)).toBe(true);
  });
});

describe("Agent Context tab — the preview drawer (AC-49, AC-59)", () => {
  it("shows the source badge and who uses the doc, and Attach ticks the row", async () => {
    renderTab({
      items: [],
      docs: [doc("specs/a.md", 3)],
      extra: {
        "GET /repos/r1/context/file?path=specs%2Fa.md": { ...doc("specs/a.md", 3), content: "# Title", used_by: 2 },
      },
    });
    await screen.findByRole("listitem", { name: "specs/a.md" });
    fireEvent.click(within(row("specs/a.md")).getByRole("button", { name: "Preview" }));

    const drawer = await screen.findByRole("dialog");
    expect(await within(drawer).findByText("Used by 2 agents")).toBeInTheDocument();
    expect(within(drawer).getByText("specs")).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole("button", { name: "Attach" }));

    expect(within(drawer).getByRole("button", { name: "Attached" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Attach specs/a.md" })).toHaveAttribute("aria-checked", "true");
  });

  it("renders markdown as text: a <script> in a doc creates no script element and never runs", async () => {
    renderTab({
      items: [],
      docs: [doc("specs/a.md", 3)],
      extra: {
        "GET /repos/r1/context/file?path=specs%2Fa.md": {
          ...doc("specs/a.md", 3),
          content: "# Safe\n\n<script>window.__x=1</script>",
          used_by: 0,
        },
      },
    });
    await screen.findByRole("listitem", { name: "specs/a.md" });
    fireEvent.click(within(row("specs/a.md")).getByRole("button", { name: "Preview" }));

    const drawer = await screen.findByRole("dialog");
    await within(drawer).findByRole("heading", { name: "Safe" });
    expect(document.querySelector("script")).toBeNull();
    expect((window as unknown as { __x?: number }).__x).toBeUndefined();
  });
});

describe("Agent Context tab — a failed save (A-6)", () => {
  it("shows the error toast and keeps the draft", async () => {
    renderTab({
      items: [],
      docs: [doc("docs/c.md", 1)],
      putResponse: () => ({ status: 500, body: { error: { code: "internal", message: "nope" } } }),
    });
    await screen.findByRole("listitem", { name: "docs/c.md" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Attach docs/c.md" }));

    save();

    expect(await screen.findByText("Couldn’t save context")).toBeInTheDocument();
    expect(screen.queryByText("Context saved")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Attach docs/c.md" })).toHaveAttribute("aria-checked", "true");
  });
});
