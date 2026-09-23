import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";
import { SkillEditor } from "./SkillEditor";

// The tabs render forms wired to hooks; stub the data layer so this test is
// about tab ROUTING, not about fetching.
vi.mock("../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useSkillTypes: () => ({ data: [{ id: "t1", name: "rubric" }] }),
  useSkillVersions: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../../../lib/toast", () => ({ useToast: () => ({ success: vi.fn() }) }));

afterEach(cleanup);

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

function renderEditor(tab: string, onTab = vi.fn()) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <SkillEditor skill={SKILL} tab={tab} onTab={onTab} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SkillEditor", () => {
  it("shows all three tabs", () => {
    renderEditor("config");
    for (const label of ["Config", "Preview", "Versions"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("renders the Config form on the config tab", () => {
    renderEditor("config");
    expect(screen.getByDisplayValue("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
  });

  it("actually BRANCHES on the tab instead of always rendering Config", () => {
    // The agent editor ignored its `tab` prop; this asserts we do not repeat that.
    renderEditor("preview");
    expect(screen.queryByText("Configuration")).not.toBeInTheDocument();
    // The body is rendered as markdown, so the '#' becomes a heading.
    expect(screen.getByRole("heading", { name: "Heading" })).toBeInTheDocument();
  });

  it("renders the Versions tab", () => {
    renderEditor("versions");
    expect(screen.queryByText("Configuration")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Versions" })).toBeInTheDocument();
  });

  it("falls back to Config for an unknown tab rather than rendering nothing", () => {
    renderEditor("bogus");
    expect(screen.getByText("Configuration")).toBeInTheDocument();
  });

  it("reports a tab change to the route", () => {
    const onTab = vi.fn();
    renderEditor("config", onTab);
    fireEvent.click(screen.getByRole("button", { name: "Versions" }));
    expect(onTab).toHaveBeenCalledWith("versions");
  });

  it("preview is read-only — no editable body field", () => {
    renderEditor("preview");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
