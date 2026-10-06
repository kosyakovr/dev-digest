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
  it("links Project Context to the active repo's context page, right after Pull Requests", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
        <AppShell>
          <div>page</div>
        </AppShell>
      </NextIntlClientProvider>,
    );

    const context = screen.getByRole("link", { name: /Project Context/ });
    expect(context).toHaveAttribute("href", "/repos/r1/context");

    const pulls = screen.getByRole("link", { name: /Pull Requests/ });
    const links = screen.getAllByRole("link");
    expect(links.indexOf(context)).toBe(links.indexOf(pulls) + 1);
  });
});
