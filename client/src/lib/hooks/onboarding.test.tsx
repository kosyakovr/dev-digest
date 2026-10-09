import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type Query } from "@tanstack/react-query";
import { useGenerateOnboardingTour, useOnboardingTour } from "./onboarding";

/* `api` is the only seam to the network (client/AGENTS.md); the QueryClient is real. */
const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
}));

let qc: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

const state = (generating: boolean) => ({ tour: null, generating, stale: false, current_indexed_sha: null });

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  get.mockReset();
  post.mockReset();
});
afterEach(cleanup);

/** The `refetchInterval` option as the cache holds it, evaluated against the query's current data. */
function intervalFor(repoId: string): unknown {
  const query = qc.getQueryCache().find({ queryKey: ["onboarding-tour", repoId] }) as Query;
  const opt = (query.options as { refetchInterval?: unknown }).refetchInterval;
  return typeof opt === "function" ? (opt as (q: Query) => unknown)(query) : opt;
}

describe("useOnboardingTour (AC-22, A-16)", () => {
  it("reads GET /repos/:id/tour under the onboarding-tour key", async () => {
    get.mockResolvedValue(state(false));
    const { result } = renderHook(() => useOnboardingTour("r1"), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(state(false)));
    expect(get).toHaveBeenCalledWith("/repos/r1/tour");
    expect(qc.getQueryData(["onboarding-tour", "r1"])).toEqual(state(false));
  });

  it("polls every 5,000 ms while the server reports generating", async () => {
    get.mockResolvedValue(state(true));
    const { result } = renderHook(() => useOnboardingTour("r1"), { wrapper });
    await waitFor(() => expect(result.current.data?.generating).toBe(true));
    expect(intervalFor("r1")).toBe(5000);
  });

  it("does not poll when no generation is running", async () => {
    get.mockResolvedValue(state(false));
    const { result } = renderHook(() => useOnboardingTour("r1"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(intervalFor("r1")).toBe(false);
  });

  it("does not fetch without a repo id", () => {
    renderHook(() => useOnboardingTour(undefined), { wrapper });
    expect(get).not.toHaveBeenCalled();
  });
});

describe("useGenerateOnboardingTour", () => {
  it("POSTs /repos/:id/tour/generate without a body and seeds the cache with the response", async () => {
    const fresh = { ...state(false), current_indexed_sha: "abc1234" };
    post.mockResolvedValue(fresh);
    const { result } = renderHook(() => useGenerateOnboardingTour(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("r1");
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]).toEqual(["/repos/r1/tour/generate"]);
    expect(qc.getQueryData(["onboarding-tour", "r1"])).toEqual(fresh);
  });

  it("leaves the cached tour alone when the call fails", async () => {
    qc.setQueryData(["onboarding-tour", "r1"], state(false));
    post.mockRejectedValue(new Error("409"));
    const { result } = renderHook(() => useGenerateOnboardingTour(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("r1").catch(() => undefined);
    });

    expect(qc.getQueryData(["onboarding-tour", "r1"])).toEqual(state(false));
  });
});
