/**
 * Cost formatting is money on screen, so the boundaries matter more than the
 * happy path: a sub-cent run must not collapse to "$0.00" (reads as free), and
 * an UNKNOWN cost must not render as a number at all.
 */
import { describe, it, expect } from "vitest";
import { formatCost, formatTokensTotal } from "./format";

describe("formatCost", () => {
  it("keeps 4 decimals under a cent so a cheap run is not rounded to $0.00", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.00009)).toBe("$0.0001");
  });

  it("uses 2 decimals from a cent upwards", () => {
    expect(formatCost(0.01)).toBe("$0.01");
    expect(formatCost(0.06)).toBe("$0.06");
    expect(formatCost(12.5)).toBe("$12.50");
  });

  it("renders a real zero as $0.00 — that is 'free', not 'unknown'", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("rounds half UP at 2 decimals, where bare toFixed rounds down", () => {
    // Regression guard: (1.005).toFixed(2) === "1.00" and (0.145).toFixed(2)
    // === "0.14" — the binary value sits just under the half.
    expect(formatCost(1.005)).toBe("$1.01");
    expect(formatCost(0.145)).toBe("$0.15");
    expect(formatCost(8.475)).toBe("$8.48");
    expect(formatCost(2.675)).toBe("$2.68");
  });

  it("absorbs the float noise a Postgres SUM() over double precision leaves", () => {
    expect(formatCost(0.01 + 0.002)).toBe("$0.01"); // 0.012000000000000002
    expect(formatCost(0.1 + 0.2)).toBe("$0.30"); // 0.30000000000000004
  });

  it("returns null for unknown, so the caller supplies its own placeholder", () => {
    expect(formatCost(null)).toBeNull();
    expect(formatCost(undefined)).toBeNull();
    expect(formatCost(Number.NaN)).toBeNull();
  });
});

describe("formatTokensTotal", () => {
  it("sums in+out with a thousands separator", () => {
    expect(formatTokensTotal(9000, 119)).toBe("9,119 tok");
    expect(formatTokensTotal(0, 0)).toBe("0 tok");
  });

  it("treats a missing half as zero, but two missing halves as unknown", () => {
    expect(formatTokensTotal(100, null)).toBe("100 tok");
    expect(formatTokensTotal(null, null)).toBeNull();
  });
});
