import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { diffLines, diffStat, filterSkills, isMarkdownFile, typeColor } from "./helpers";
import { TYPE_COLOR_FALLBACK, TYPE_COLORS } from "./constants";

const skill = (over: Partial<Skill>): Skill => ({
  id: "s1",
  name: "pr-quality-rubric",
  description: "Rubric for PR quality.",
  type: "rubric",
  source: "manual",
  body: "# Rule",
  enabled: true,
  version: 1,
  evidence_files: null,
  ...over,
});

describe("typeColor", () => {
  it("uses the design colour for a seeded type", () => {
    expect(typeColor("security")).toBe(TYPE_COLORS.security);
  });
  it("falls back to neutral for a user-authored type", () => {
    // Types are user-editable, so the map must never be treated as exhaustive.
    expect(typeColor("accessibility")).toBe(TYPE_COLOR_FALLBACK);
  });
});

describe("filterSkills", () => {
  const list = [
    skill({ id: "a", name: "secret-gate", description: "Finds leaks", type: "security" }),
    skill({ id: "b", name: "no-then-chains", description: "Prefer await", type: "convention" }),
  ];

  it("returns everything for an empty or whitespace query", () => {
    expect(filterSkills(list, "")).toHaveLength(2);
    expect(filterSkills(list, "   ")).toHaveLength(2);
  });
  it("matches name, description and type, case-insensitively", () => {
    expect(filterSkills(list, "SECRET").map((s) => s.id)).toEqual(["a"]);
    expect(filterSkills(list, "await").map((s) => s.id)).toEqual(["b"]);
    expect(filterSkills(list, "security").map((s) => s.id)).toEqual(["a"]);
  });
  it("returns nothing when nothing matches", () => {
    expect(filterSkills(list, "zzz")).toEqual([]);
  });
});

describe("isMarkdownFile", () => {
  it("accepts .md and .markdown in any case", () => {
    expect(isMarkdownFile("a.md")).toBe(true);
    expect(isMarkdownFile("a.MARKDOWN")).toBe(true);
  });
  it("rejects anything else, including an archive", () => {
    // Archive import is deliberately out of scope — no zip reader is available.
    expect(isMarkdownFile("skills.zip")).toBe(false);
    expect(isMarkdownFile("notes.txt")).toBe(false);
    expect(isMarkdownFile("md")).toBe(false);
  });
});

describe("diffLines", () => {
  it("marks every line the same for identical bodies", () => {
    const rows = diffLines("a\nb", "a\nb");
    expect(rows.every((r) => r.op === "same")).toBe(true);
    expect(diffStat(rows)).toEqual({ added: 0, removed: 0 });
  });

  it("detects a pure insertion without rewriting the context", () => {
    const rows = diffLines("a\nc", "a\nb\nc");
    expect(rows).toEqual([
      { op: "same", text: "a" },
      { op: "added", text: "b" },
      { op: "same", text: "c" },
    ]);
    expect(diffStat(rows)).toEqual({ added: 1, removed: 0 });
  });

  it("detects a pure deletion", () => {
    const rows = diffLines("a\nb\nc", "a\nc");
    expect(rows).toEqual([
      { op: "same", text: "a" },
      { op: "removed", text: "b" },
      { op: "same", text: "c" },
    ]);
  });

  it("represents a changed line as removed + added", () => {
    const rows = diffLines("a\nold\nc", "a\nnew\nc");
    expect(diffStat(rows)).toEqual({ added: 1, removed: 1 });
    expect(rows.map((r) => r.op)).toEqual(["same", "removed", "added", "same"]);
  });

  it("reconstructs both inputs exactly", () => {
    // The real invariant: same+removed must rebuild `before`, same+added `after`.
    const before = "# Title\n\n- one\n- two\n\nTail";
    const after = "# Title\n\n- one\n- TWO\n- three\n\nTail";
    const rows = diffLines(before, after);
    expect(rows.filter((r) => r.op !== "added").map((r) => r.text).join("\n")).toBe(before);
    expect(rows.filter((r) => r.op !== "removed").map((r) => r.text).join("\n")).toBe(after);
  });

  it("handles an empty side", () => {
    expect(diffStat(diffLines("", "a\nb"))).toEqual({ added: 2, removed: 1 });
    expect(diffLines("a", "a")).toEqual([{ op: "same", text: "a" }]);
  });

  it("does not choke on a large body", () => {
    // Guards the quadratic table: this must return, not hang or blow the heap.
    const before = Array.from({ length: 1500 }, (_, i) => `line ${i}`).join("\n");
    const after = `${before}\nextra`;
    const rows = diffLines(before, after);
    expect(rows.length).toBeGreaterThan(0);
    expect(diffStat(rows).added).toBeGreaterThan(0);
  });
});
