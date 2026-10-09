import { describe, it, expect } from "vitest";
import { AgentVersion, ContextItem, RunTrace } from "@devdigest/shared";

/**
 * The client's vendored `@devdigest/shared` is a byte copy of the server's
 * (L05 WP0). These parse cases only compile and pass if the client copy has the
 * server's widened types.
 */
describe("client copy of the shared contracts", () => {
  it("AgentVersion accepts the openrouter provider (WP0 re-sync)", () => {
    const parsed = AgentVersion.parse({
      agent_id: "a",
      version: 1,
      config: {
        provider: "openrouter",
        model: "m",
        system_prompt: "s",
        strategy: "auto",
        ci_fail_on: "critical",
        repo_intel: true,
        skills: [],
      },
      created_at: "2026-10-06",
    });
    expect(parsed.config.provider).toBe("openrouter");
  });

  it("RunTrace keeps project_context when present and parses stored traces without it", () => {
    const base = {
      config: { agent: "A", model: "m", source: "local" },
      stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, cost_usd: null, findings: 0, grounding: "0/0 passed" },
      prompt_assembly: { system: "s", user: "u" },
      tool_calls: [],
      raw_output: "{}",
      memory_pulled: [],
      specs_read: [],
      log: [],
    };
    expect(RunTrace.parse(base).project_context).toBeUndefined();
    const entries = [{ path: "specs/a.md", tokens: 3, status: "included", via_skill: null, text: "x" }];
    expect(RunTrace.parse({ ...base, project_context: entries }).project_context).toEqual(entries);
  });

  it("ContextItem rejects a negative or fractional position", () => {
    expect(() => ContextItem.parse({ path: "a.md", position: -1 })).toThrow();
    expect(() => ContextItem.parse({ path: "a.md", position: 1.5 })).toThrow();
    expect(ContextItem.parse({ path: "a.md", position: null }).position).toBeNull();
  });
});
