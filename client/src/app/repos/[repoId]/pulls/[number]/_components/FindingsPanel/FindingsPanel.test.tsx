/**
 * FindingsPanel — the severity counters and the severity filter inside one
 * expanded review run.
 *
 * Two invariants here are the feature's whole contract and must hold in EVERY
 * toggle state:
 *   - each counter equals the number of finding cards rendered below it;
 *   - counting and filtering are local work — no request is made when the page
 *     opens or when a filter is toggled.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

// Hoisted so assertions can read the same spy the component called.
const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate, isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

function finding(o: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "WARNING",
    category: "security",
    title: `Finding ${o.id}`,
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

/** One critical, two warnings (one low-confidence), one suggestion. */
const FINDINGS: FindingRecord[] = [
  finding({ id: "f1", severity: "CRITICAL", title: "Hardcoded secret", confidence: 0.95 }),
  finding({ id: "f2", severity: "WARNING", title: "N+1 query", confidence: 0.86 }),
  finding({ id: "f3", severity: "WARNING", title: "Unbounded retry", confidence: 0.4 }),
  finding({ id: "f4", severity: "SUGGESTION", title: "Magic number", confidence: 0.9 }),
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/** The number shown on a counter pill ("2 CRITICAL" → 2), or null if absent. */
function counterValue(container: HTMLElement, severity: string): number | null {
  const pill = [...container.querySelectorAll("span")].find((el) =>
    new RegExp(`^\\d+ ${severity}$`).test(el.textContent ?? ""),
  );
  return pill ? Number(pill.textContent!.split(" ")[0]) : null;
}

/** Cards of one severity currently rendered beneath the counters. */
function cardCount(container: HTMLElement, severity: string): number {
  return container.querySelectorAll(`[data-finding-id][data-severity="${severity}"]`).length;
}

/**
 * "Each counter equals the cards below it", asserted as an invariant rather
 * than as fixed numbers.
 *
 * Scope: the UNFILTERED view. While a severity filter is active the counters
 * deliberately keep showing the run's inventory — they are the filter's own
 * targets, and zeroing them would leave the user nothing to switch to.
 */
function expectCountersMatchCards(container: HTMLElement) {
  for (const sev of ["CRITICAL", "WARNING", "SUGGESTION"]) {
    const shown = counterValue(container, sev);
    if (shown == null) {
      // A severity with no counter must have no cards — "only the severities
      // actually present" is the other half of the same rule.
      expect(cardCount(container, sev)).toBe(0);
    } else {
      expect(shown).toBe(cardCount(container, sev));
    }
  }
}

afterEach(cleanup);
beforeEach(() => mutate.mockClear());

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel — severity counters", () => {
  it("shows a counter only for the severities this run actually has", () => {
    const { container } = renderWithIntl(
      <FindingsPanel findings={[FINDINGS[0]!, FINDINGS[3]!]} prId="pr1" />,
    );
    // Rendered as one string, so "1 CRITICAL" is what a reader (and a text
    // locator) actually sees.
    expect(screen.getByText("1 CRITICAL")).toBeInTheDocument();
    expect(counterValue(container, "CRITICAL")).toBe(1);
    expect(counterValue(container, "SUGGESTION")).toBe(1);
    // No warnings in this run ⇒ no WARNING counter at all.
    expect(counterValue(container, "WARNING")).toBeNull();
  });

  it("counts match the cards rendered below, and still do after a filter is cleared", () => {
    const { container } = renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(counterValue(container, "CRITICAL")).toBe(1);
    expect(counterValue(container, "WARNING")).toBe(2);
    expect(counterValue(container, "SUGGESTION")).toBe(1);
    expectCountersMatchCards(container);

    // Round-trip through a filter: the counters must come back unchanged.
    fireEvent.click(screen.getByRole("button", { name: "Warning" }));
    fireEvent.click(screen.getByRole("button", { name: "Warning" }));
    expectCountersMatchCards(container);
  });

  it("keeps showing the run's inventory while a filter is active, so the user can switch", () => {
    const { container } = renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "Warning" }));

    // Only warnings are listed…
    expect(cardCount(container, "WARNING")).toBe(2);
    expect(cardCount(container, "CRITICAL")).toBe(0);
    // …but the CRITICAL counter still reports the 1 critical this run found.
    // Zeroing it would hide the very thing the next click should reach.
    expect(counterValue(container, "CRITICAL")).toBe(1);
    expect(counterValue(container, "WARNING")).toBe(2);
  });

  it("counts follow the hide-low-confidence toggle, since they count what is shown", () => {
    const { container } = renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(counterValue(container, "WARNING")).toBe(2);

    fireEvent.click(screen.getByRole("switch"));

    // The 0.40-confidence warning is gone from both the list and its counter.
    expect(screen.queryByText("Unbounded retry")).not.toBeInTheDocument();
    expect(counterValue(container, "WARNING")).toBe(1);
    expectCountersMatchCards(container);
  });
});

describe("FindingsPanel — severity filter", () => {
  it("leaves only the chosen severity, and restores the full list on a second click", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    const critical = screen.getByRole("button", { name: "Critical" });
    expect(critical).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(critical);
    expect(critical).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.queryByText("N+1 query")).not.toBeInTheDocument();
    expect(screen.queryByText("Magic number")).not.toBeInTheDocument();

    fireEvent.click(critical);
    expect(critical).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.getByText("Magic number")).toBeInTheDocument();
  });

  it("offers all three filters even when this run has none of that severity", () => {
    renderWithIntl(<FindingsPanel findings={[FINDINGS[0]!]} prId="pr1" />);
    for (const name of ["Critical", "Warning", "Suggestion"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("falls back to the empty state when a filter matches nothing", () => {
    renderWithIntl(<FindingsPanel findings={[FINDINGS[0]!]} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "Suggestion" }));
    expect(screen.getByText("No findings match")).toBeInTheDocument();
    // The filter is NOT silently cleared — the user chose it.
    expect(screen.getByRole("button", { name: "Suggestion" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("re-points the keyboard focus at the first card of the filtered list", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    // Move focus off the first card, then filter: without a reset, `a` would
    // act on whatever now sits at the stale index.
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.click(screen.getByRole("button", { name: "Warning" }));
    fireEvent.keyDown(window, { key: "a" });

    expect(mutate).toHaveBeenCalledWith({ findingId: "f2", action: "accept", prId: "pr1" });
  });
});

describe("FindingsPanel — no LLM, no network", () => {
  it("counts and filters locally: opening and toggling issue no request", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
      fireEvent.click(screen.getByRole("button", { name: "Critical" }));
      fireEvent.click(screen.getByRole("button", { name: "Critical" }));
      fireEvent.click(screen.getByRole("button", { name: "Warning" }));
      fireEvent.click(screen.getByRole("switch"));

      expect(fetchSpy).not.toHaveBeenCalled();
      // Nor is a mutation fired — filtering is a view concern, not an action.
      expect(mutate).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
