import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useBlastResync, usePrBlast, usePrHistory } from "./blast";

/* `api` is the only seam to the network (client/AGENTS.md); the QueryClient is real. */
const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
}));

let qc: QueryClient;
let serverUpdatedAt: string;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

const stateOf = (updatedAt: string) => ({
  status: "full",
  filesIndexed: 1,
  filesSkipped: 0,
  lastIndexedSha: "s",
  updatedAt,
});

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  serverUpdatedAt = "t1";
  get.mockReset();
  post.mockReset();
  get.mockImplementation(async (path: string) => {
    if (path === "/repos/r1/index-state") return stateOf(serverUpdatedAt);
    if (path === "/pulls/p1/blast") return { changed_symbols: [], downstream: [], summary: "s" };
    if (path === "/pulls/p1/history") return { history: [] };
    throw new Error(`unexpected GET ${path}`);
  });
  post.mockResolvedValue({ status: "accepted" });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Mount the hook and wait until the index-state (baseline `t1`) is in the cache. */
async function mountResync() {
  const view = renderHook(() => useBlastResync("r1", "p1"), { wrapper });
  await waitFor(() => expect(qc.getQueryData(["repo-intel-state", "r1"])).toBeDefined());
  return view;
}

describe("usePrBlast / usePrHistory", () => {
  it("usePrBlast reads GET /pulls/:id/blast under the pr-blast key", async () => {
    const { result } = renderHook(() => usePrBlast("p1"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(get).toHaveBeenCalledWith("/pulls/p1/blast");
    expect(qc.getQueryData(["pr-blast", "p1"])).toBeDefined();
  });

  it("usePrBlast does not fetch without a PR id", () => {
    renderHook(() => usePrBlast(undefined), { wrapper });
    expect(get).not.toHaveBeenCalled();
  });

  it("usePrHistory reads GET /pulls/:id/history and keeps the result fresh for 5 minutes", async () => {
    const { result } = renderHook(() => usePrHistory("p1"), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ history: [] }));
    expect(get).toHaveBeenCalledWith("/pulls/p1/history");
    const options = qc.getQueryCache().find({ queryKey: ["pr-history", "p1"] })?.options as { staleTime?: number };
    expect(options.staleTime).toBe(5 * 60_000);
  });
});

describe("useBlastResync", () => {
  it("start() POSTs the resync once and reports running", async () => {
    const { result } = await mountResync();
    expect(result.current.running).toBe(false);
    act(() => result.current.start());
    expect(result.current.running).toBe(true);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![0]).toBe("/repos/r1/resync");
  });

  it("stays running while updatedAt is unchanged; a new updatedAt invalidates the blast query and stops", async () => {
    const { result } = await mountResync();
    const invalidate = vi.spyOn(qc, "invalidateQueries");

    act(() => result.current.start());
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    // The resync's own onSuccess refetches the state; it still says t1.
    await waitFor(() => expect(get.mock.calls.filter((c) => c[0] === "/repos/r1/index-state").length).toBeGreaterThan(1));
    expect(result.current.running).toBe(true);
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["pr-blast", "p1"] });

    serverUpdatedAt = "t2";
    await act(async () => {
      await qc.refetchQueries({ queryKey: ["repo-intel-state", "r1"] });
    });
    await waitFor(() => expect(result.current.running).toBe(false));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["pr-blast", "p1"] });
  });

  it("a failed POST stops running and exposes the error", async () => {
    post.mockRejectedValue(new Error("resync refused"));
    const { result } = await mountResync();
    act(() => result.current.start());
    await waitFor(() => expect(result.current.running).toBe(false));
    expect(result.current.error?.message).toBe("resync refused");
  });

  it("gives up after 120 seconds without a new updatedAt", async () => {
    const { result } = await mountResync();
    vi.useFakeTimers();
    act(() => result.current.start());
    expect(result.current.running).toBe(true);
    act(() => {
      vi.advanceTimersByTime(119_000);
    });
    expect(result.current.running).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(result.current.running).toBe(false);
  });

  it("on the 120 s ceiling it reloads the blast once and reports timedOut; a new start() clears it", async () => {
    const { result } = await mountResync();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    vi.useFakeTimers();
    act(() => result.current.start());
    expect(result.current.timedOut).toBe(false);
    act(() => {
      vi.advanceTimersByTime(120_500);
    });
    expect(result.current.timedOut).toBe(true);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["pr-blast", "p1"] });
    act(() => result.current.start());
    expect(result.current.timedOut).toBe(false);
  });

  it("start() before the index state loaded: the first state seen is the baseline, not a completion", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    get.mockImplementation(async (path: string) => {
      if (path === "/repos/r1/index-state") {
        await gate;
        return stateOf(serverUpdatedAt);
      }
      throw new Error(`unexpected GET ${path}`);
    });
    const { result } = renderHook(() => useBlastResync("r1", "p1"), { wrapper });
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    act(() => result.current.start()); // index state not loaded yet
    await act(async () => {
      release();
      await gate;
    });
    await waitFor(() => expect(qc.getQueryData(["repo-intel-state", "r1"])).toBeDefined());
    // The old state (t1) arrived after start(): still running, blast not reloaded.
    expect(result.current.running).toBe(true);
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["pr-blast", "p1"] });

    serverUpdatedAt = "t2";
    await act(async () => {
      await qc.refetchQueries({ queryKey: ["repo-intel-state", "r1"] });
    });
    await waitFor(() => expect(result.current.running).toBe(false));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["pr-blast", "p1"] });
  });
});
