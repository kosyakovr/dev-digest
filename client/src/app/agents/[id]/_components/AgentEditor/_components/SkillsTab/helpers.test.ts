import { describe, it, expect } from "vitest";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import {
  attachedRows,
  buildRows,
  countEnabled,
  moveRow,
  reorderTo,
  toPayload,
  toggleAttached,
  toggleEnabled,
} from "./helpers";

const skill = (id: string, name: string): Skill => ({
  id,
  name,
  description: "",
  type: "custom",
  source: "manual",
  body: `# ${name}`,
  enabled: true,
  version: 1,
  evidence_files: null,
});

const SKILLS = [skill("a", "alpha"), skill("b", "beta"), skill("c", "gamma")];
const link = (skill_id: string, order: number, enabled = true): AgentSkillLink => ({
  agent_id: "ag1",
  skill_id,
  order,
  enabled,
});

const ids = (rows: { skill: Skill }[]) => rows.map((r) => r.skill.id);

describe("buildRows", () => {
  it("puts attached skills first IN LINK ORDER, then the rest alphabetically", () => {
    // Link order is prompt order, so it must beat both creation and name order.
    const rows = buildRows(SKILLS, [link("c", 0), link("a", 1)]);
    expect(ids(rows)).toEqual(["c", "a", "b"]);
    expect(rows.map((r) => r.attached)).toEqual([true, true, false]);
  });

  it("respects `order` rather than array position", () => {
    const rows = buildRows(SKILLS, [link("a", 5), link("b", 2)]);
    expect(ids(attachedRows(rows))).toEqual(["b", "a"]);
  });

  it("carries the per-link enabled flag through", () => {
    const rows = buildRows(SKILLS, [link("a", 0, false)]);
    expect(rows[0]).toMatchObject({ attached: true, enabled: false });
  });

  it("skips a link whose skill is missing instead of crashing", () => {
    // A stale cache can hold a link to a just-deleted skill.
    const rows = buildRows(SKILLS, [link("gone", 0), link("a", 1)]);
    expect(ids(attachedRows(rows))).toEqual(["a"]);
  });

  it("lists every skill as detached when nothing is linked", () => {
    const rows = buildRows(SKILLS, []);
    expect(rows.every((r) => !r.attached)).toBe(true);
    expect(ids(rows)).toEqual(["a", "b", "c"]);
  });
});

describe("toggleAttached", () => {
  it("appends a newly attached skill to the END, leaving the existing order alone", () => {
    const rows = toggleAttached(buildRows(SKILLS, [link("c", 0), link("a", 1)]), "b");
    expect(ids(attachedRows(rows))).toEqual(["c", "a", "b"]);
  });

  it("detaching drops it out of the ordered prefix", () => {
    const rows = toggleAttached(buildRows(SKILLS, [link("a", 0), link("b", 1)]), "a");
    expect(ids(attachedRows(rows))).toEqual(["b"]);
    expect(rows.find((r) => r.skill.id === "a")!.attached).toBe(false);
  });

  it("re-attaching a muted skill comes back enabled", () => {
    let rows = buildRows(SKILLS, [link("a", 0, false)]);
    rows = toggleAttached(rows, "a"); // detach
    rows = toggleAttached(rows, "a"); // re-attach
    expect(rows.find((r) => r.skill.id === "a")).toMatchObject({ attached: true, enabled: true });
  });
});

describe("toggleEnabled", () => {
  it("mutes an attached link WITHOUT detaching it, keeping its place", () => {
    const rows = toggleEnabled(buildRows(SKILLS, [link("a", 0), link("b", 1)]), "a");
    expect(rows[0]).toMatchObject({ skill: SKILLS[0], attached: true, enabled: false });
    expect(ids(attachedRows(rows))).toEqual(["a", "b"]);
  });

  it("is a no-op on a detached row — there is no link to mute", () => {
    const rows = buildRows(SKILLS, []);
    expect(toggleEnabled(rows, "a")).toEqual(rows);
  });
});

describe("countEnabled", () => {
  it("counts only attached AND enabled links", () => {
    const rows = buildRows(SKILLS, [link("a", 0), link("b", 1, false)]);
    expect(countEnabled(rows)).toBe(1);
  });
});

describe("moveRow", () => {
  const rows = () => buildRows(SKILLS, [link("a", 0), link("b", 1), link("c", 2)]);

  it("moves a row up and down within the attached prefix", () => {
    expect(ids(attachedRows(moveRow(rows(), "c", -1)))).toEqual(["a", "c", "b"]);
    expect(ids(attachedRows(moveRow(rows(), "a", 1)))).toEqual(["b", "a", "c"]);
  });

  it("clamps at both ends rather than wrapping or spilling into the detached list", () => {
    expect(ids(attachedRows(moveRow(rows(), "a", -1)))).toEqual(["a", "b", "c"]);
    expect(ids(attachedRows(moveRow(rows(), "c", 1)))).toEqual(["a", "b", "c"]);
  });

  it("ignores a detached or unknown skill", () => {
    const r = buildRows(SKILLS, [link("a", 0)]);
    expect(moveRow(r, "b", -1)).toEqual(r);
    expect(moveRow(r, "nope", -1)).toEqual(r);
  });
});

describe("reorderTo", () => {
  it("moves a row to an absolute index (drag and drop)", () => {
    const rows = buildRows(SKILLS, [link("a", 0), link("b", 1), link("c", 2)]);
    expect(ids(attachedRows(reorderTo(rows, "c", 0)))).toEqual(["c", "a", "b"]);
    expect(ids(attachedRows(reorderTo(rows, "a", 2)))).toEqual(["b", "c", "a"]);
  });
});

describe("toPayload", () => {
  it("emits only attached rows, in order, with their enabled flag", () => {
    const rows = buildRows(SKILLS, [link("c", 0), link("a", 1, false)]);
    expect(toPayload(rows)).toEqual([
      { skill_id: "c", enabled: true },
      { skill_id: "a", enabled: false },
    ]);
  });

  it("is empty when nothing is attached", () => {
    expect(toPayload(buildRows(SKILLS, []))).toEqual([]);
  });

  it("round-trips: payload order rebuilds the same attached order", () => {
    const rows = buildRows(SKILLS, [link("b", 0), link("c", 1)]);
    const links = toPayload(rows).map((p, i) => link(p.skill_id, i, p.enabled));
    expect(ids(attachedRows(buildRows(SKILLS, links)))).toEqual(ids(attachedRows(rows)));
  });
});
