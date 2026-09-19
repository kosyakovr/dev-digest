/**
 * PRRow — the list is a CSS grid, not a table: the row's cells are POSITIONAL
 * and the column count lives in two other files (`GRID`, `COLUMN_KEYS`). A cell
 * added without its grid track silently shifts every column after it, which no
 * type check catches — so the guard here is "cells === columns", plus the cost
 * cell's own unknown/known rendering.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { COLUMN_KEYS, GRID } from "../../constants";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

afterEach(cleanup);

function pr(o: Partial<PrMeta> = {}): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "abc123",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: "2026-06-11T18:00:00.000Z",
    updated_at: "2026-06-11T18:44:34.000Z",
    score: 61,
    cost_usd: 0.014,
    ...o,
  };
}

function renderRow(meta: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={meta} repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost column", () => {
  it("renders the PR's lifetime run cost", () => {
    // Adaptive precision: a cent or more prints 2 decimals, so 0.014 → "$0.01".
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.01")).toBeInTheDocument();
  });

  it("keeps full precision on a sub-cent total", () => {
    renderRow(pr({ cost_usd: 0.0021 }));
    expect(screen.getByText("$0.0021")).toBeInTheDocument();
  });

  it("renders an em dash when no run on the PR has a known cost", () => {
    renderRow(pr({ cost_usd: null }));
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("keeps one cell per declared column, so the positional grid stays aligned", () => {
    const { container } = renderRow(pr());
    const row = container.firstElementChild as HTMLElement;
    expect(row.children).toHaveLength(COLUMN_KEYS.length);
    expect(GRID.trim().split(/\s+/)).toHaveLength(COLUMN_KEYS.length);
  });
});
