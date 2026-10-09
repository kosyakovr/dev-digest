import { describe, it, expect } from "vitest";
import { activeKeyFor } from "./helpers";

describe("activeKeyFor — Onboarding Tour", () => {
  it("marks the tour page of a repo as the Onboarding Tour item (AC-2)", () => {
    expect(activeKeyFor("/repos/x/tour")).toBe("onboarding-tour");
  });

  it("does not mark the add-repository wizard at /onboarding as the Onboarding Tour item (AC-3)", () => {
    expect(activeKeyFor("/onboarding")).not.toBe("onboarding-tour");
  });
});
