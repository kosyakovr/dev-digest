import { describe, it, expect } from "vitest";
import type { SpecFile } from "@devdigest/shared";
import {
  blockPaths,
  buildSections,
  canMoveDown,
  canMoveUp,
  dropOn,
  flatOrder,
  inheritedSummary,
  moveDown,
  moveUp,
  toPayload,
  toggle,
  total,
  type Draft,
} from "./helpers";

/**
 * The ordering rules of the Context tabs (plan WP8 step 2, spec A-23…A-25):
 * the "manual block" is the attached rows that have a position; every other row
 * keeps its source group. Expected values are written from those rules.
 */
const doc = (path: string, tokens: number | null = 1): SpecFile => ({
  path,
  content: null,
  size: 4,
  updated_at: null,
  tokens,
  source: path.split("/").find((s) => s === "docs" || s === "specs") ?? null,
  used_by: null,
});
const item = (path: string, position: number | null) => ({ path, position });
/** A draft as a path → position map, so the assertion ignores the array order. */
const byPath = (d: Draft) => Object.fromEntries(d.map((i) => [i.path, i.position]));
const orderOf = (docs: SpecFile[], draft: Draft, filter = "") => flatOrder(buildSections(docs, draft, filter));

describe("buildSections", () => {
  const docs = [doc("specs/b.md"), doc("docs/z.md"), doc("docs/a.md"), doc("specs/a.md")];

  it("puts the positioned rows first by position, then the groups by source then path", () => {
    const s = buildSections(docs, [item("specs/b.md", 1), item("docs/z.md", 0)], "");
    expect(s.manual.map((r) => r.path)).toEqual(["docs/z.md", "specs/b.md"]);
    expect(s.groups.map((g) => g.source)).toEqual(["docs", "specs"]);
    expect(s.groups.map((g) => g.rows.map((r) => r.path))).toEqual([["docs/a.md"], ["specs/a.md"]]);
    expect(s.notFound).toEqual([]);
  });

  it("keeps an attached, unpositioned doc under its source group, flagged attached", () => {
    const s = buildSections(docs, [item("docs/a.md", null)], "");
    const docsGroup = s.groups.find((g) => g.source === "docs")!;
    expect(docsGroup.rows.map((r) => [r.path, r.attached])).toEqual([
      ["docs/a.md", true],
      ["docs/z.md", false],
    ]);
  });

  it("lists an unpositioned attached path missing from the repo last, in notFound", () => {
    const s = buildSections(docs, [item("specs/gone.md", null), item("docs/ghost.md", null)], "");
    expect(s.notFound.map((r) => r.path)).toEqual(["docs/ghost.md", "specs/gone.md"]);
    expect(s.notFound.every((r) => r.doc === null && r.attached)).toBe(true);
  });

  it("keeps a positioned not-found path inside the manual block", () => {
    const s = buildSections(docs, [item("specs/gone.md", 0)], "");
    expect(s.manual.map((r) => r.path)).toEqual(["specs/gone.md"]);
    expect(s.manual[0]!.doc).toBeNull();
    expect(s.notFound).toEqual([]);
  });

  it("filters by a case-insensitive path substring and hides empty groups", () => {
    const s = buildSections(docs, [], "SPECS/");
    expect(s.groups.map((g) => g.source)).toEqual(["specs"]);
    expect(flatOrder(s)).toEqual(["specs/a.md", "specs/b.md"]);
  });

  it("with no list (no repo / list failed) shows only the attached paths", () => {
    const s = buildSections(null, [item("a.md", 0), item("b.md", null)], "");
    expect(s.manual.map((r) => r.path)).toEqual(["a.md"]);
    expect(s.groups).toEqual([]);
    expect(s.notFound.map((r) => r.path)).toEqual(["b.md"]);
  });
});

describe("toggle", () => {
  it("ticking attaches with no position; unticking removes it and renumbers the block", () => {
    const ticked = toggle([item("docs/a.md", 0), item("docs/b.md", 1)], "docs/c.md");
    expect(byPath(ticked)).toEqual({ "docs/a.md": 0, "docs/b.md": 1, "docs/c.md": null });

    const unticked = toggle([item("docs/a.md", 0), item("docs/b.md", 1), item("docs/c.md", 2)], "docs/a.md");
    expect(byPath(unticked)).toEqual({ "docs/b.md": 0, "docs/c.md": 1 });
  });

  it("unticking a positioned row clears its position by removing it; ticking it again gives none", () => {
    const off = toggle([item("specs/a.md", 0)], "specs/a.md");
    expect(off).toEqual([]);
    expect(byPath(toggle(off, "specs/a.md"))).toEqual({ "specs/a.md": null });
  });
});

describe("dropOn (AC-62, AC-63)", () => {
  const docs = [doc("specs/a.md"), doc("docs/d.md"), doc("docs/e.md"), doc("specs/g.md")];
  const draft = (): Draft => [item("specs/a.md", 0), item("docs/e.md", null)];

  it("dropping a row on itself does nothing", () => {
    const d = draft();
    expect(dropOn(d, orderOf(docs, d), "specs/a.md", "specs/a.md")).toEqual(d);
  });

  it("dropping a block row on another block row puts it before that row", () => {
    const d = [item("a.md", 0), item("b.md", 1), item("c.md", 2)];
    const all = ["a.md", "b.md", "c.md"];
    expect(blockPaths(dropOn(d, all, "c.md", "a.md"))).toEqual(["c.md", "a.md", "b.md"]);
    expect(blockPaths(dropOn(d, all, "a.md", "c.md"))).toEqual(["b.md", "a.md", "c.md"]);
  });

  it("dropping an attached row on the first row after the block makes it the last block row", () => {
    const d = draft();
    const order = orderOf(docs, d); // a | d, e, g
    expect(order).toEqual(["specs/a.md", "docs/d.md", "docs/e.md", "specs/g.md"]);
    const out = dropOn(d, order, "docs/e.md", "docs/d.md");
    expect(blockPaths(out)).toEqual(["specs/a.md", "docs/e.md"]);
    expect(byPath(out)).toEqual({ "specs/a.md": 0, "docs/e.md": 1 });
  });

  it("with an empty block, the first row of the list is that first-after-block row", () => {
    const d: Draft = [item("docs/e.md", null)];
    const order = orderOf(docs, d);
    const out = dropOn(d, order, "docs/e.md", order[0]!);
    expect(byPath(out)).toEqual({ "docs/e.md": 0 });
  });

  it("dropping on any other row clears the dragged row's position and renumbers the rest", () => {
    const d = [item("a.md", 0), item("b.md", 1), item("c.md", 2)];
    const order = ["a.md", "b.md", "c.md", "x.md", "y.md"];
    const out = dropOn(d, order, "a.md", "y.md");
    expect(byPath(out)).toEqual({ "a.md": null, "b.md": 0, "c.md": 1 });
  });

  it("an unattached row cannot be dragged", () => {
    const d = draft();
    expect(dropOn(d, orderOf(docs, d), "docs/d.md", "specs/a.md")).toEqual(d);
  });
});

describe("moveUp / moveDown (AC-64, AC-67, AC-68)", () => {
  const block = (): Draft => [item("a.md", 0), item("b.md", 1), item("c.md", 2)];

  it("moves a block row up by swapping with the one above", () => {
    const once = moveUp(block(), "c.md");
    expect(blockPaths(once)).toEqual(["a.md", "c.md", "b.md"]);
    expect(byPath(moveUp(once, "c.md"))).toEqual({ "c.md": 0, "a.md": 1, "b.md": 2 });
  });

  it("move up is disabled on the first block row", () => {
    expect(canMoveUp(block(), "a.md")).toBe(false);
    expect(blockPaths(moveUp(block(), "a.md"))).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("move up on an attached unpositioned row makes it the last block row", () => {
    const d: Draft = [item("a.md", 0), item("u.md", null)];
    expect(canMoveUp(d, "u.md")).toBe(true);
    expect(byPath(moveUp(d, "u.md"))).toEqual({ "a.md": 0, "u.md": 1 });
  });

  it("move up is unavailable for an unattached row", () => {
    expect(canMoveUp(block(), "zz.md")).toBe(false);
  });

  it("moves a block row down by swapping with the one below", () => {
    expect(blockPaths(moveDown(block(), "a.md"))).toEqual(["b.md", "a.md", "c.md"]);
  });

  it("move down on the last block row clears its position", () => {
    const out = moveDown(block(), "c.md");
    expect(byPath(out)).toEqual({ "a.md": 0, "b.md": 1, "c.md": null });
    expect(canMoveDown(block(), "c.md")).toBe(true);
  });

  it("move down is disabled on an unpositioned row", () => {
    const d: Draft = [item("a.md", 0), item("u.md", null)];
    expect(canMoveDown(d, "u.md")).toBe(false);
    expect(moveDown(d, "u.md")).toEqual(d);
  });
});

describe("total and inheritedSummary (R-14, REC-2)", () => {
  const docs = [doc("docs/own.md", 3900), doc("docs/inh.md", 200), doc("docs/other.md", 50)];
  const inherited = [{ items: [item("docs/inh.md", null)] }];

  it("adds the tokens of inherited docs that are not attached directly", () => {
    expect(total([item("docs/own.md", null)], docs, inherited)).toBe(4100);
  });

  it("counts a doc attached directly AND inherited once", () => {
    expect(total([item("docs/own.md", null), item("docs/inh.md", null)], docs, inherited)).toBe(4100);
  });

  it("leaves out an attached path that is not in the repo list", () => {
    expect(total([item("docs/own.md", null), item("docs/gone.md", null)], docs, [])).toBe(3900);
  });

  it("with no list, nothing has tokens", () => {
    expect(total([item("docs/own.md", null)], null, [])).toBe(0);
  });

  it("summarises distinct inherited paths across skills", () => {
    const s = inheritedSummary(
      [{ items: [item("docs/inh.md", null), item("docs/other.md", null)] }, { items: [item("docs/inh.md", null)] }],
      docs,
    );
    expect(s.count).toBe(2);
    expect(s.tokens).toBe(250);
  });
});

describe("toPayload", () => {
  it("renumbers the positioned rows 0..n-1 and keeps unpositioned rows null", () => {
    const out = toPayload([item("a.md", 4), item("b.md", 9), item("u.md", null)]);
    expect(byPath(out)).toEqual({ "a.md": 0, "b.md": 1, "u.md": null });
    expect(out).toHaveLength(3);
  });
});
