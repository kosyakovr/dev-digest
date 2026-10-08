import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import onboardingMessages from "../../../../../messages/en/onboarding.json";
import commonMessages from "../../../../../messages/en/common.json";
import shellMessages from "../../../../../messages/en/shell.json";

// Unlike page.test.tsx, `@/lib/toast` is NOT mocked here: the real global
// MutationCache toast (providers.tsx) is what AC-23 is about.
vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/repos/r1/tour",
}));
vi.mock("@/lib/repo-context", () => {
  const repo = { id: "r1", full_name: "acme/payments-api", default_branch: "main", last_polled_at: null };
  return {
    useActiveRepo: () => ({ repoId: "r1", repos: [repo], activeRepo: repo, setRepoId: vi.fn(), reposLoaded: true }),
    useRepoNotFound: () => false,
    RepoProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { Providers } from "@/lib/providers";
import TourPage from "./page";

const MESSAGE = "An onboarding tour is already being generated for this repository.";

const section = (kind: string, title: string, body: string) => ({ kind, title, body, diagram: null, links: [] });
const llmTour = {
  sections: [
    section("architecture_overview", "Architecture overview", "Architecture body text."),
    section("critical_paths", "Critical paths", "Critical body text."),
    section("how_to_run", "How to run locally", "Run body text."),
    section("guided_reading", "Guided reading path", "Reading body text."),
    section("first_tasks", "First tasks", "Tasks body text."),
  ],
  source: "llm",
  index_status: "full",
  indexed_sha: "abc1234def",
  files_indexed: 42,
  generated_at: "2026-10-08T10:00:00.000Z",
  model: "m/x",
  cost_usd: 0.001,
};
const state = { tour: llmTour, generating: false, stale: false, current_indexed_sha: "abc1234def" };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Onboarding Tour page — a failed generate (AC-23)", () => {
  it("toasts the server's message once and keeps showing the previous tour", async () => {
    const posts: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "POST") {
          posts.push(url.pathname);
          return new Response(JSON.stringify({ error: { code: "tour_in_progress", message: MESSAGE } }), {
            status: 409,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify(state), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    render(
      <Providers>
        <NextIntlClientProvider
          locale="en"
          messages={{ onboarding: onboardingMessages, common: commonMessages, shell: shellMessages }}
        >
          <TourPage />
        </NextIntlClientProvider>
      </Providers>,
    );

    await screen.findByText("Tasks body text.");
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Regenerate" }));

    expect(await screen.findByText(MESSAGE)).toBeInTheDocument();
    await waitFor(() => expect(posts).toEqual(["/repos/r1/tour/generate"]));
    // One toast, not two: the page adds no toast of its own on top of the global one.
    expect(screen.getAllByText(MESSAGE)).toHaveLength(1);
    // The previous page state is still there, and the button is usable again.
    expect(screen.getByText("Onboarding for acme/payments-api")).toBeInTheDocument();
    expect(screen.getByText("Tasks body text.")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled());
  });
});
