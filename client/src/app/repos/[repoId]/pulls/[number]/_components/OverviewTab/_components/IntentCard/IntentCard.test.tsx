import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/intent.json";
import { IntentCard } from "./IntentCard";

// pr-self-review D-1 (a failed derive is announced) and D-2 (a failed refetch
// must not hide the cached intent).

interface QueryState {
  data: { intent: PrIntentRecord | null } | undefined;
  isLoading: boolean;
  isError: boolean;
}
let query: QueryState;
let derive: { isPending: boolean; isError: boolean; error: Error | null };
const refetch = vi.fn();
const mutate = vi.fn();

vi.mock("@/lib/hooks", () => ({
  usePrIntent: () => ({ ...query, refetch }),
  useDeriveIntent: () => ({ ...derive, mutate }),
}));

const RECORD: PrIntentRecord = {
  pr_id: "p1",
  intent: "Add rate limiting to the public API",
  in_scope: ["middleware"],
  out_of_scope: ["billing"],
  confidence: "high",
  sources: [{ kind: "description", ref: null, status: "used", reason: null }],
  head_sha: "abc",
  stale: false,
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  tokens_in: 10,
  tokens_out: 5,
  cost_usd: null,
  derived_at: "2026-10-01T10:00:00.000Z",
};

function renderCard() {
  render(
    <NextIntlClientProvider locale="en" messages={{ intent: messages }}>
      <IntentCard prId="p1" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  query = { data: { intent: RECORD }, isLoading: false, isError: false };
  derive = { isPending: false, isError: false, error: null };
  refetch.mockReset();
  mutate.mockReset();
});
afterEach(cleanup);

describe("IntentCard — a failed derive is announced (D-1)", () => {
  it("empty state: role=alert carries the message", () => {
    query = { data: { intent: null }, isLoading: false, isError: false };
    derive = { isPending: false, isError: true, error: new Error("model unavailable") };
    renderCard();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not derive the intent: model unavailable");
  });

  it("card state: role=alert carries the message and the intent stays visible", () => {
    derive = { isPending: false, isError: true, error: new Error("model unavailable") };
    renderCard();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not derive the intent: model unavailable");
    expect(screen.getByText("Add rate limiting to the public API")).toBeInTheDocument();
  });

  it("no alert when the derive did not fail", () => {
    renderCard();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("IntentCard — load error only replaces the card when there is nothing cached (D-2)", () => {
  it("isError with cached data still renders the card, no error state", () => {
    query = { data: { intent: RECORD }, isLoading: false, isError: true };
    renderCard();
    expect(screen.getByText("Add rate limiting to the public API")).toBeInTheDocument();
    expect(screen.queryByText("Could not load the intent.")).toBeNull();
  });

  it("isError without data renders the error state with a retry", () => {
    query = { data: undefined, isLoading: false, isError: true };
    renderCard();
    expect(screen.getByText("Could not load the intent.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText("Add rate limiting to the public API")).toBeNull();
  });
});
