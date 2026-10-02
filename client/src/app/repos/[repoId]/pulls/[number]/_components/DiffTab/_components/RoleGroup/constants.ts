import type { SmartDiffRole } from "@devdigest/shared";

/** Role → i18n key (prReview namespace) of the group label. */
export const ROLE_LABEL_KEY = {
  core: "smartDiff.coreLabel",
  tests: "smartDiff.testsLabel",
  wiring: "smartDiff.wiringLabel",
  docs: "smartDiff.docsLabel",
  boilerplate: "smartDiff.boilerplateLabel",
} as const satisfies Record<SmartDiffRole, string>;

/** Low-signal groups start collapsed. */
export const COLLAPSED_BY_DEFAULT: ReadonlySet<SmartDiffRole> = new Set(["docs", "boilerplate"]);
