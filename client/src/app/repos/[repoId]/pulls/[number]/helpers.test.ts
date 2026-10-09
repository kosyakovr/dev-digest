import { describe, it, expect } from "vitest";
import { readDiffTarget, withDiffTarget } from "./helpers";

/** URL state of the PR page (spec AC-34, AC-36, AC-37, A-34). */

describe("withDiffTarget", () => {
  it("switches to the diff tab, sets file and line, and keeps other params", () => {
    const sp = new URLSearchParams(withDiffTarget("tab=overview&trace=r1", "src/a b.ts", 12));
    expect(sp.get("tab")).toBe("diff");
    expect(sp.get("file")).toBe("src/a b.ts");
    expect(sp.get("line")).toBe("12");
    expect(sp.get("trace")).toBe("r1");
  });

  it("encodes the path: no raw slash or space survives in the file value", () => {
    const qs = withDiffTarget("", "src/a b.ts", 1);
    expect(qs).not.toMatch(/file=[^&]*[ /]/);
    expect(qs).toMatch(/file=src%2Fa(%20|\+)b\.ts/);
  });

  it("without a line (a risk file) there is no line param, and an older one is removed", () => {
    expect(new URLSearchParams(withDiffTarget("tab=overview", "src/a.ts", null)).has("line")).toBe(false);
    const sp = new URLSearchParams(withDiffTarget("tab=diff&file=old.ts&line=3", "src/a.ts", null));
    expect(sp.has("line")).toBe(false);
    expect(sp.get("file")).toBe("src/a.ts");
  });
});

describe("readDiffTarget", () => {
  it("reads the file and the line", () => {
    expect(readDiffTarget("tab=diff&file=src%2Fa.ts&line=12")).toEqual({ file: "src/a.ts", line: 12 });
  });

  it("a line that is not a positive integer becomes null, the file stays", () => {
    for (const bad of ["0", "x", "1.5", "-2", ""]) {
      expect(readDiffTarget(`file=src%2Fa.ts&line=${bad}`), bad).toEqual({ file: "src/a.ts", line: null });
    }
    expect(readDiffTarget("file=src%2Fa.ts")).toEqual({ file: "src/a.ts", line: null });
  });

  it("without a file there is no target, whatever the line says", () => {
    expect(readDiffTarget("tab=diff&line=12")).toBeNull();
    expect(readDiffTarget("")).toBeNull();
    expect(readDiffTarget("file=&line=3")).toBeNull();
  });

  it("round-trips what withDiffTarget wrote", () => {
    expect(readDiffTarget(withDiffTarget("tab=overview", "src/a b.ts", 7))).toEqual({ file: "src/a b.ts", line: 7 });
    expect(readDiffTarget(withDiffTarget("tab=overview", "src/a b.ts", null))).toEqual({
      file: "src/a b.ts",
      line: null,
    });
  });
});
