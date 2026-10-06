import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { TraceBody } from "./TraceBody";

afterEach(cleanup);

const A_TEXT = '<untrusted source="specs/a.md">\nA\n</untrusted>';

/** A run that included specs/a.md and skipped specs/gone.md (deleted from the clone). */
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 0, grounding: "0/0 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: null, memory: null, specs: A_TEXT, user: "Review PR #482" },
  tool_calls: [],
  raw_output: "{}",
  memory_pulled: [],
  specs_read: ["specs/a.md"],
  project_context: [
    { path: "specs/a.md", tokens: 120, status: "included", via_skill: null, text: A_TEXT },
    { path: "specs/gone.md", tokens: 0, status: "skipped", reason: "not_found", via_skill: null, text: null },
  ],
  log: [],
};

function renderBody() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <TraceBody trace={TRACE} findings={[]} />
    </NextIntlClientProvider>,
  );
}

/** Climb from the element showing `path` to the first ancestor that also holds `text`. */
function sameRowAs(path: string, text: string, otherPath: string): boolean {
  let el: HTMLElement | null = screen.getByText(path);
  while (el && !(el.textContent ?? "").includes(text)) el = el.parentElement;
  return el !== null && !(el.textContent ?? "").includes(otherPath);
}

function renderTrace(trace: RunTrace, agentId?: string | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <TraceBody trace={trace} findings={[]} agentId={agentId} />
    </NextIntlClientProvider>,
  );
}

const skipped = (path: string, reason: "not_found" | "too_large" | "unreadable", via?: { id: string; name: string }) => ({
  path,
  tokens: 0,
  status: "skipped" as const,
  reason,
  via_skill: via ?? null,
  text: null,
});

describe("TraceBody — the T2 edges", () => {
  it("shows 'none' for a trace with no project_context and an empty specs_read (AC-44)", () => {
    const { project_context: _drop, ...legacy } = TRACE;
    renderTrace({ ...legacy, specs_read: [], prompt_assembly: { ...TRACE.prompt_assembly, specs: null } });
    expect(screen.getByText("none")).toBeInTheDocument();
  });

  it("renders a legacy specs_read list as before (AC-44)", () => {
    const { project_context: _drop, ...legacy } = TRACE;
    renderTrace({ ...legacy, specs_read: ["x.md"] });
    expect(screen.getByText("x.md")).toBeInTheDocument();
    expect(screen.queryByText("none")).not.toBeInTheDocument();
  });

  it("links 'Remove from agent' to the agent's Context tab for a directly attached doc (AC-50)", () => {
    renderTrace({ ...TRACE, project_context: [skipped("specs/gone.md", "not_found")] }, "ag1");
    const link = screen.getByRole("link", { name: "Remove from agent" });
    expect(link).toHaveAttribute("href", "/agents/ag1?tab=context");
  });

  it("links 'Remove from skill <name>' to that skill's Context tab for an inherited doc (AC-51)", () => {
    renderTrace(
      { ...TRACE, project_context: [skipped("docs/s.md", "not_found", { id: "sk1", name: "Security" })] },
      "ag1",
    );
    const link = screen.getByRole("link", { name: "Remove from skill Security" });
    expect(link).toHaveAttribute("href", "/skills/sk1?tab=context");
    expect(screen.queryByRole("link", { name: "Remove from agent" })).not.toBeInTheDocument();
  });

  it("shows no link for a direct doc when the run's agent is unknown (AC-51)", () => {
    renderTrace({ ...TRACE, project_context: [skipped("specs/gone.md", "not_found")] }, null);
    expect(screen.getByText("skipped — not found")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("says why a doc was skipped: too large, or unreadable (AC-37)", () => {
    renderTrace({
      ...TRACE,
      project_context: [skipped("docs/big.md", "too_large"), skipped("docs/bad.md", "unreadable")],
    });
    expect(screen.getByText("skipped — too large")).toBeInTheDocument();
    expect(screen.getByText("skipped — unreadable")).toBeInTheDocument();
  });

  it("never turns a <script> inside an entry's text into an element (NFR-3)", () => {
    const text = '<untrusted source="docs/x.md">\n<script>window.__z=1</script>\n</untrusted>';
    renderTrace({
      ...TRACE,
      project_context: [{ path: "docs/x.md", tokens: 5, status: "included", via_skill: null, text }],
    });
    fireEvent.click(screen.getByText("Prompt assembly"));
    fireEvent.click(screen.getByText(/docs\/x\.md · ≈ 5 tokens/));

    expect(screen.getByText(text, { normalizer: (s) => s })).toBeInTheDocument(); // shown as text
    expect(document.querySelector("script")).toBeNull();
    expect((window as unknown as { __z?: number }).__z).toBeUndefined();
  });
});

describe("TraceBody — project context", () => {
  it("lists each attached doc under Specs read with its tokens or why it was skipped", () => {
    renderBody();

    expect(screen.getByText("≈ 120 tokens")).toBeInTheDocument();
    expect(screen.getByText("skipped — not found")).toBeInTheDocument();
    expect(sameRowAs("specs/a.md", "≈ 120 tokens", "specs/gone.md")).toBe(true);
    expect(sameRowAs("specs/gone.md", "skipped — not found", "specs/a.md")).toBe(true);
  });

  it("shows one Prompt assembly entry per included doc, and opening it reveals the exact block", () => {
    renderBody();
    fireEvent.click(screen.getByText("Prompt assembly"));

    expect(screen.getByText("Project context — attached specs (untrusted)")).toBeInTheDocument();
    // The single "Project context (dynamic)" block is replaced by per-doc entries.
    expect(screen.queryByText("Project context (dynamic)")).not.toBeInTheDocument();

    // Only the included doc has an entry — the skipped one has no text to show.
    expect(screen.queryByText(/specs\/gone\.md · /)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/specs\/a\.md · ≈ 120 tokens/));

    expect(screen.getByText(A_TEXT, { normalizer: (s) => s })).toBeInTheDocument();
  });
});
