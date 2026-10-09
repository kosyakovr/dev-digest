import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/intent.json";
import { IntentCard } from "./IntentCard";

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

const STATEMENT = "Add rate limiting to the public API";
const RECORD: PrIntentRecord = {
  pr_id: "p1",
  intent: STATEMENT,
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

const tree = () => (
  <NextIntlClientProvider locale="en" messages={{ intent: messages }}>
    <IntentCard prId="p1" />
  </NextIntlClientProvider>
);

beforeEach(() => {
  query = { data: { intent: RECORD }, isLoading: false, isError: false };
  derive = { isPending: false, isError: false, error: null };
  refetch.mockReset();
  mutate.mockReset();
});
afterEach(cleanup);

describe("IntentCard", () => {
  it("a PR with no intent: the user derives it, and a failed derive is announced", () => {
    query = { data: { intent: null }, isLoading: false, isError: false };
    const { rerender } = render(tree());
    expect(screen.getByText("No intent derived yet.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Derive intent" }));
    expect(mutate).toHaveBeenCalledTimes(1);

    derive = { isPending: false, isError: true, error: new Error("model unavailable") };
    rerender(tree());
    expect(screen.getByRole("alert")).toHaveTextContent("Could not derive the intent: model unavailable");
  });

  it("a PR with an intent: re-derive works, a failed derive is announced, and a failed background refetch keeps the card", () => {
    const { rerender } = render(tree());
    expect(screen.getByText(STATEMENT)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Re-derive intent" }));
    expect(mutate).toHaveBeenCalledTimes(1);

    derive = { isPending: false, isError: true, error: new Error("model unavailable") };
    rerender(tree());
    expect(screen.getByRole("alert")).toHaveTextContent("Could not derive the intent: model unavailable");
    expect(screen.getByText(STATEMENT)).toBeInTheDocument();

    // The query refetch fails while the cached intent is still there: the card stays.
    query = { data: { intent: RECORD }, isLoading: false, isError: true };
    rerender(tree());
    expect(screen.getByText(STATEMENT)).toBeInTheDocument();
    expect(screen.queryByText("Could not load the intent.")).toBeNull();
  });

  it("AC-45: with a child (the brief's Risk areas) the empty state still offers Derive, followed by the child", () => {
    query = { data: { intent: null }, isLoading: false, isError: false };
    render(
      <NextIntlClientProvider locale="en" messages={{ intent: messages }}>
        <IntentCard prId="p1">
          <div>CHILD</div>
        </IntentCard>
      </NextIntlClientProvider>,
    );
    const derive = screen.getByRole("button", { name: "Derive intent" });
    expect(screen.getByText("No intent derived yet.")).toBeInTheDocument();
    expect(derive.compareDocumentPosition(screen.getByText("CHILD")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(derive);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("AC-45: a child renders after a derived intent and after a load error, but not while loading", () => {
    const withChild = () => (
      <NextIntlClientProvider locale="en" messages={{ intent: messages }}>
        <IntentCard prId="p1">
          <div>CHILD</div>
        </IntentCard>
      </NextIntlClientProvider>
    );
    const { rerender } = render(withChild());
    expect(screen.getByText(STATEMENT)).toBeInTheDocument();
    expect(
      screen.getByText(STATEMENT).compareDocumentPosition(screen.getByText("CHILD")) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    query = { data: undefined, isLoading: false, isError: true };
    rerender(withChild());
    expect(screen.getByText("Could not load the intent.")).toBeInTheDocument();
    expect(screen.getByText("CHILD")).toBeInTheDocument();

    query = { data: undefined, isLoading: true, isError: false };
    rerender(withChild());
    expect(screen.queryByText("CHILD")).toBeNull();
  });

  it("the intent cannot be loaded and nothing is cached: an error with Retry, and Retry refetches", () => {
    query = { data: undefined, isLoading: false, isError: true };
    render(tree());
    expect(screen.getByText("Could not load the intent.")).toBeInTheDocument();
    expect(screen.queryByText(STATEMENT)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
