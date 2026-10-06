import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import skillMessages from "../../../../../../../../messages/en/skills.json";
import contextMessages from "../../../../../../../../messages/en/context.json";
import { ToastProvider } from "@/lib/toast";

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: "r1",
    activeRepo: { id: "r1", full_name: "acme/payments-api", default_branch: "main" },
  }),
  useRepoNotFound: () => false,
}));

import { ContextTab } from "./ContextTab";

const SKILL: Skill = {
  id: "s1",
  name: "pr-quality-rubric",
  description: "Rubric for PR quality",
  type: "rubric",
  source: "manual",
  body: "# Heading\n\nSome **bold** prose.",
  enabled: true,
  version: 1,
  evidence_files: null,
};

type Call = { method: string; key: string; body: unknown };
let calls: Call[] = [];

/** Answer `fetch` by "METHOD /path?query"; anything unanswered is a 404 envelope. */
function stubApi(routes: Record<string, unknown | ((body: unknown) => unknown)>) {
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
      const out = typeof hit === "function" ? (hit as (b: unknown) => unknown)(body) : hit;
      return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const listed = (path: string, tokens: number) => ({
  path,
  content: null,
  size: tokens * 4,
  updated_at: null,
  tokens,
  source: path.split("/")[0],
  used_by: null,
});

function renderTab(
  opts: { items?: { path: string; position: number | null }[]; docs?: ReturnType<typeof listed>[] } = {},
) {
  stubApi({
    "GET /context/sources": { folders: ["docs", "specs"] },
    "GET /repos/r1/context": opts.docs ?? [listed("docs/a.md", 2)],
    "GET /skills/s1/context": { items: opts.items ?? [{ path: "docs/a.md", position: null }] },
    "PUT /skills/s1/context": (body: unknown) => body,
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NextIntlClientProvider locale="en" messages={{ skills: skillMessages, context: contextMessages }}>
        <ToastProvider>
          <ContextTab skill={SKILL} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("Skill Context tab", () => {
  it("says that agents using the skill inherit the documents", async () => {
    renderTab();
    await screen.findByRole("listitem", { name: "docs/a.md" });
    expect(screen.getByText("Any agent using this skill inherits these documents.")).toBeInTheDocument();
  });

  it("orders rows like the agent tab: manual block, then docs group, then specs group (AC-58)", async () => {
    renderTab({
      items: [
        { path: "specs/b.md", position: 0 },
        { path: "specs/a.md", position: null },
      ],
      docs: [listed("specs/a.md", 1), listed("specs/b.md", 1), listed("docs/z.md", 1)],
    });
    await screen.findByRole("listitem", { name: "docs/z.md" });

    const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const row = (p: string) => screen.getByRole("listitem", { name: p });
    const chain = [
      row("specs/b.md"),
      screen.getByRole("heading", { name: "docs" }),
      row("docs/z.md"),
      screen.getByRole("heading", { name: "specs" }),
      row("specs/a.md"),
    ];
    for (let i = 0; i < chain.length - 1; i++) expect(follows(chain[i]!, chain[i + 1]!)).toBe(true);
  });

  it("shows no inherited-from-skills line, since a skill inherits nothing", async () => {
    renderTab();
    await screen.findByRole("listitem", { name: "docs/a.md" });
    expect(screen.queryByText(/Inherited from skills/)).not.toBeInTheDocument();
  });

  it("saves through PUT /skills/<id>/context, not the agent route", async () => {
    renderTab();
    await screen.findByRole("listitem", { name: "docs/a.md" });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1));
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.key).toBe("PUT /skills/s1/context");
    expect(put.body).toEqual({ items: [{ path: "docs/a.md", position: null }] });
  });
});
