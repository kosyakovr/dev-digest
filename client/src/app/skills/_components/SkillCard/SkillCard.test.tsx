import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "s1",
  name: "secret-leakage-gate",
  description: "Flags leaked credentials",
  type: "security",
  source: "manual",
  body: "# Secret Gate",
  enabled: true,
  version: 2,
  evidence_files: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SkillCard", () => {
  it("renders the name, type chip and version", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when the description is empty", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("renders a user-authored type that is not one of the built-ins", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, type: "accessibility" }} />);
    expect(screen.getByText("accessibility")).toBeInTheDocument();
  });

  it("opens the skill when the card is clicked", () => {
    const onClick = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onClick={onClick} />);
    fireEvent.click(screen.getByText("secret-leakage-gate"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("toggling enabled does NOT also open the skill", () => {
    // The toggle sits inside the clickable card, so its click must not bubble —
    // otherwise flipping a switch navigates away from the page.
    const onClick = vi.fn();
    const onToggle = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onClick={onClick} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("asks for confirmation before deleting, and does nothing when declined", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onClick = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onClick={onClick} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[0]![0]).toContain("secret-leakage-gate");
    expect(onClick).not.toHaveBeenCalled(); // delete must not navigate either
    confirm.mockRestore();
  });
});
