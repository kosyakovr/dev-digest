import { describe, it, expect } from "vitest";
import type { BlastRadius } from "@devdigest/shared";
import { blastCounts, callerHref, linkSha } from "./helpers";

/* The fixture is the mapper fixture of server/test/blast-helpers.test.ts: the
   same numbers must come out of the client formula (3 symbols, 4 callers,
   2 endpoints, 1 cron — the server `summary` string). */
const RADIUS: BlastRadius = {
  changed_symbols: [
    { name: "A", file: "src/a.ts", kind: "function" },
    { name: "B", file: "src/b.ts", kind: "function" },
    { name: "C", file: "src/c.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "A",
      callers: [
        { name: "yFn", file: "src/y.ts", line: 1, depth: 1 },
        { name: "xFn", file: "src/x.ts", line: 1, depth: 1 },
        { name: "zFn", file: "src/z.ts", line: 1, depth: 2, through: "xFn" },
      ],
      endpoints_affected: ["GET /a", "POST /b"],
      crons_affected: ["nightly"],
    },
    {
      symbol: "B",
      callers: [{ name: "wFn", file: "src/w.ts", line: 1, depth: 1 }],
      endpoints_affected: ["GET /a"],
      crons_affected: ["nightly"],
    },
  ],
  summary: "3 symbol(s) → 4 caller(s) · 2 endpoint(s) · 1 cron(s)",
};

describe("blastCounts", () => {
  it("sums callers and counts endpoints/crons once across groups", () => {
    expect(blastCounts(RADIUS)).toEqual({ symbols: 3, callers: 4, endpoints: 2, crons: 1 });
  });

  it("an empty radius is all zeros", () => {
    expect(blastCounts({ changed_symbols: [], downstream: [], summary: "" })).toEqual({
      symbols: 0,
      callers: 0,
      endpoints: 0,
      crons: 0,
    });
  });
});

describe("linkSha", () => {
  it("prefers the indexed sha, then the PR head, then null", () => {
    expect(linkSha({ ...RADIUS, indexed_sha: "idx" }, "head")).toBe("idx");
    expect(linkSha(RADIUS, "head")).toBe("head");
    expect(linkSha(RADIUS, null)).toBeNull();
    expect(linkSha(RADIUS, undefined)).toBeNull();
  });
});

describe("callerHref", () => {
  const caller = { file: "src/api/x.ts", line: 12 };
  it("builds the GitHub blob URL at the line", () => {
    expect(callerHref("acme/api", "idx1", caller)).toBe("https://github.com/acme/api/blob/idx1/src/api/x.ts#L12");
  });
  it("is null without a repo or without a sha", () => {
    expect(callerHref(null, "idx1", caller)).toBeNull();
    expect(callerHref(undefined, "idx1", caller)).toBeNull();
    expect(callerHref("acme/api", null, caller)).toBeNull();
  });
  it("encodes path segments but keeps the slashes", () => {
    expect(callerHref("acme/api", "s", { file: "src/a b/c#d.ts", line: 1 })).toBe(
      "https://github.com/acme/api/blob/s/src/a%20b/c%23d.ts#L1",
    );
  });
});
