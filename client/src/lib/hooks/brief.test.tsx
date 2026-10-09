import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useGeneratePrBrief, usePrBrief } from "./brief";

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

const state = (generating: boolean) => ({ brief: null, generating, stale: false });

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  get.mockReset();
  post.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("usePrBrief", () => {
  it("reads GET /pulls/:id/brief under the pr-brief key and does not fetch without an id", async () => {
    get.mockResolvedValue(state(false));
    const { result } = renderHook(() => usePrBrief("p1"), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(state(false)));
    expect(get).toHaveBeenCalledWith("/pulls/p1/brief");
    expect(qc.getQueryData(["pr-brief", "p1"])).toEqual(state(false));

    get.mockClear();
    renderHook(() => usePrBrief(undefined), { wrapper });
    expect(get).not.toHaveBeenCalled();
  });

  it("AC-26: refetches every 5 s while generating is true and stops once it is false", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get.mockResolvedValueOnce(state(true)).mockResolvedValue(state(false));
    const { result } = renderHook(() => usePrBrief("p1"), { wrapper });
    await waitFor(() => expect(result.current.data?.generating).toBe(true));
    expect(get).toHaveBeenCalledTimes(1);

    // Under 5 s: no second request yet.
    await act(async () => {
      vi.advanceTimersByTime(4_000);
    });
    expect(get).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1_500);
    });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.data?.generating).toBe(false));

    // generating is false now: a further 10 s sends nothing.
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe("useGeneratePrBrief", () => {
  it("POSTs /pulls/:id/brief without a body, seeds the brief cache and invalidates the intent", async () => {
    const fresh = { brief: null, generating: false, stale: false, marker: "fresh" };
    post.mockResolvedValue(fresh);
    qc.setQueryData(["pr-intent", "p1"], { intent: null });
    const { result } = renderHook(() => useGeneratePrBrief("p1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]).toEqual(["/pulls/p1/brief"]);
    expect(qc.getQueryData(["pr-brief", "p1"])).toEqual(fresh);
    // AC-6: a missing intent is derived by the POST, so the Intent card must refetch.
    expect(qc.getQueryState(["pr-intent", "p1"])?.isInvalidated).toBe(true);
  });

  it("leaves the cached brief alone when the call fails", async () => {
    qc.setQueryData(["pr-brief", "p1"], state(false));
    post.mockRejectedValue(new Error("502"));
    const { result } = renderHook(() => useGeneratePrBrief("p1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });

    expect(qc.getQueryData(["pr-brief", "p1"])).toEqual(state(false));
  });
});
