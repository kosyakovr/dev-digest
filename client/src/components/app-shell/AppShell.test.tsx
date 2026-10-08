import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import shellMessages from "../../../messages/en/shell.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/repos/r1/pulls",
}));
vi.mock("@/lib/repo-context", () => {
  const repo = {
    id: "r1",
    full_name: "acme/payments-api",
    default_branch: "main",
    last_polled_at: null,
  };
  return {
    useActiveRepo: () => ({
      repoId: "r1",
      repos: [repo],
      activeRepo: repo,
      setRepoId: vi.fn(),
      reposLoaded: true,
    }),
  };
});
vi.mock("@/lib/hooks", () => ({
  usePulls: () => ({ data: [] }),
  useDeleteRepo: () => ({ mutate: vi.fn() }),
}));

import { AppShell } from "./AppShell";

afterEach(cleanup);

describe("AppShell sidebar", () => {
  function renderShell() {
    render(
      <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
        <AppShell>
          <div>page</div>
        </AppShell>
      </NextIntlClientProvider>,
    );
  }

  it("links Project Context to the active repo's context page", () => {
    renderShell();

    const context = screen.getByRole("link", { name: /Project Context/ });
    expect(context).toHaveAttribute("href", "/repos/r1/context");
  });

  // L05 onboarding tour AC-1: WORKSPACE reads Pull Requests, Onboarding Tour,
  // Project Context, in that order (supersedes "Project Context right after Pull Requests").
  it("lists Onboarding Tour between Pull Requests and Project Context, linking to the active repo's tour page (AC-1)", () => {
    renderShell();

    const pulls = screen.getByRole("link", { name: /Pull Requests/ });
    const tour = screen.getByRole("link", { name: /Onboarding Tour/ });
    const context = screen.getByRole("link", { name: /Project Context/ });
    expect(tour).toHaveAttribute("href", "/repos/r1/tour");

    const links = screen.getAllByRole("link");
    expect(links.indexOf(tour)).toBe(links.indexOf(pulls) + 1);
    expect(links.indexOf(context)).toBe(links.indexOf(tour) + 1);
  });
});
