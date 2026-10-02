/** How the Files changed tab lays out files: role groups, or the PR's own order. */
export type DiffOrder = "smart" | "original";

/** Toggle options, left to right → i18n key (prReview namespace) of the label. */
export const DIFF_ORDER_OPTIONS = [
  { value: "smart", labelKey: "smartDiff.smartOrder" },
  { value: "original", labelKey: "smartDiff.originalOrder" },
] as const satisfies ReadonlyArray<{ value: DiffOrder; labelKey: string }>;
