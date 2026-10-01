import { describe, it, expect } from "vitest";
import { IntentSourceKind, IntentUnresolvedReason, type IntentSource } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/intent.json";
import { sourcesSummary, unresolvedList } from "./helpers";

const used = (kind: IntentSource["kind"], ref: string | null = null): IntentSource => ({
  kind,
  ref,
  status: "used",
  reason: null,
});

describe("unresolvedList (C-1)", () => {
  const labels = {
    kind: (k: string) => `K[${k}]`,
    reason: (r: string) => `R[${r}]`,
  };

  it("shows the ref when there is one, the translated kind when there is none", () => {
    const text = unresolvedList(
      [
        { kind: "spec", ref: "docs/x.md", reason: "too_large" },
        { kind: "branch", ref: null, reason: "not_found" },
      ],
      labels,
    );
    expect(text).toBe("docs/x.md (R[too_large]) · K[branch] (R[not_found])");
  });

  it("joins entries with ' · ' and is empty for no entries", () => {
    expect(
      unresolvedList(
        [
          { kind: "link", ref: "https://a", reason: "external_not_fetched" },
          { kind: "link", ref: "https://b", reason: "cross_repo" },
        ],
        labels,
      ),
    ).toBe("https://a (R[external_not_fetched]) · https://b (R[cross_repo])");
    expect(unresolvedList([], labels)).toBe("");
  });

  it("intent.json has a readable kind.* and reason.* label for every contract value", () => {
    for (const k of IntentSourceKind.options) {
      expect(typeof (messages.kind as Record<string, string>)[k], `kind.${k}`).toBe("string");
    }
    for (const r of IntentUnresolvedReason.options) {
      expect(typeof (messages.reason as Record<string, string>)[r], `reason.${r}`).toBe("string");
    }
  });
});

describe("sourcesSummary (C-2)", () => {
  it("never displays a link source", () => {
    const out = sourcesSummary([used("description"), used("link", "https://example.com")]);
    expect(out).toEqual([{ kind: "description", ref: null }]);
  });

  it("branch and files fold into a single diff entry", () => {
    expect(sourcesSummary([used("description"), used("branch")])).toEqual([
      { kind: "description", ref: null },
      { kind: "diff", ref: null },
    ]);
    expect(sourcesSummary([used("description"), used("files")])).toEqual([
      { kind: "description", ref: null },
      { kind: "diff", ref: null },
    ]);
    expect(sourcesSummary([used("description"), used("branch"), used("files"), used("diff")])).toEqual([
      { kind: "description", ref: null },
      { kind: "diff", ref: null },
    ]);
  });

  it("branch, files and diff alone are 'diffOnly': only the PR's own code informed the intent", () => {
    expect(sourcesSummary([used("title"), used("branch"), used("files"), used("diff")])).toBe("diffOnly");
  });

  it("lists tickets and specs by ref, in display order", () => {
    expect(sourcesSummary([used("commits"), used("spec", "docs/x.md"), used("ticket", "#12"), used("title")])).toEqual([
      { kind: "title", ref: null },
      { kind: "ticket", ref: "#12" },
      { kind: "spec", ref: "docs/x.md" },
      { kind: "commits", ref: null },
    ]);
  });

  it("an unresolved source is not shown as used", () => {
    const out = sourcesSummary([
      used("description"),
      { kind: "ticket", ref: "#9", status: "unresolved", reason: "not_found" },
    ]);
    expect(out).toEqual([{ kind: "description", ref: null }]);
  });
});
