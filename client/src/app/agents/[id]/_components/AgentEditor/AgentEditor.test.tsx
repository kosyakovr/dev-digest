import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../messages/en/agents.json";
import contextMessages from "../../../../../../messages/en/context.json";
import { ToastProvider } from "../../../../../lib/toast";

// The Context tab reads the active repo for its doc list.
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: "r1",
    activeRepo: { id: "r1", full_name: "acme/payments-api", default_branch: "main" },
  }),
}));

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

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

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("renders the Context tab for ?tab=context instead of the Config form", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname;
        const body = path === "/agents/ag1/context" ? { items: [], inherited: [] } : path === "/context/sources" ? { folders: ["docs", "specs"] } : [];
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <NextIntlClientProvider locale="en" messages={{ agents: messages, context: contextMessages }}>
          <ToastProvider>
            <AgentEditor agent={AGENT} tab="context" onTab={() => {}} />
          </ToastProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByPlaceholderText("Filter documents…")).toBeInTheDocument();
    expect(screen.queryByText("Configuration")).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("lists the tabs Config, Skills, Context in that order", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    const tabs = screen
      .getAllByRole("button", { name: /^(Config|Skills|Context)$/ })
      .map((b) => b.textContent?.trim());
    expect(tabs).toEqual(["Config", "Skills", "Context"]);
  });
});
