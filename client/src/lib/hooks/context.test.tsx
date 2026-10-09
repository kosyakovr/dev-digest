import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useContextFile, useSetAgentContext } from "./context";

/* The real `api` runs; only `fetch` (the network edge) is stubbed. */
const fetchMock = vi.fn();
let qc: QueryClient;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const urlOf = (call: unknown[]) => new URL(String(call[0]));

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useSetAgentContext", () => {
  it("sends one PUT with the items body and stores the response under the agent's key", async () => {
    const response = { items: [{ path: "specs/a.md", position: null }], inherited: [] };
    fetchMock.mockResolvedValue(json(response));
    const { result } = renderHook(() => useSetAgentContext(), { wrapper });

    result.current.mutate({ agentId: "a1", items: [{ path: "specs/a.md", position: null }] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]!;
    expect(urlOf(call).pathname).toBe("/agents/a1/context");
    expect((call[1] as RequestInit).method).toBe("PUT");
    expect((call[1] as RequestInit).body).toBe('{"items":[{"path":"specs/a.md","position":null}]}');
    expect(qc.getQueryData(["agent-context", "a1"])).toEqual(response);
  });
});

describe("useContextFile", () => {
  it("requests the file route with the path URL-encoded", async () => {
    fetchMock.mockResolvedValue(json({ path: "docs/a b.md", content: "x" }));
    const { result } = renderHook(() => useContextFile("r1", "docs/a b.md"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = urlOf(fetchMock.mock.calls[0]!);
    expect(url.pathname).toBe("/repos/r1/context/file");
    expect(url.search).toBe("?path=docs%2Fa%20b.md");
  });

  it("stays idle until both a repo and a path are given", () => {
    const noPath = renderHook(() => useContextFile("r1", null), { wrapper });
    const noRepo = renderHook(() => useContextFile(null, "docs/a.md"), { wrapper });
    expect(noPath.result.current.fetchStatus).toBe("idle");
    expect(noRepo.result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
