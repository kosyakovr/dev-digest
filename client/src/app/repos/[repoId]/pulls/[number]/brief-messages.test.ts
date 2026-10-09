import { describe, it, expect } from "vitest";
import brief from "../../../../../../messages/en/brief.json";

/**
 * NFR-11: the user-visible strings are the spec's § Contract wording, verbatim
 * (specs/L05-risk-brief.md § Contract "Wording"). The expected values below are
 * copied from the spec, not read back from brief.json.
 */
const SPEC: Record<string, string> = {
  "block.risks": "Risk areas",
  noRisks: "No notable risks flagged.",
  section: "PR Brief",
  "empty.title": "No brief yet",
  "empty.body": "Generate a Why+Risk brief for this PR.",
  generate: "Generate brief",
  generating: "Generating brief…",
  regenerate: "Re-run the brief for this PR",
  stale: "Generated for {sha} — there are new commits",
  provenance:
    "Verdict, findings and score come from the latest agent review; what / why / risks / review-focus come from the brief.",
  "focus.title": "Review focus — read these first",
  "focus.open": "Open {file}:{line} in Files changed",
  "focus.empty": "No review focus items",
  "risk.open": "Open {file} in Files changed",
  "risk.why": "Why this is a risk",
  "severity.high": "High",
  "severity.medium": "Medium",
  "severity.low": "Low",
  notInDiff: "File not in this PR's diff",
  "degraded.blast": "Blast radius was incomplete when this brief was written ({reason}).",
  "degraded.history": "PR history was incomplete when this brief was written ({reason}).",
  meta: "{model} · {cost}",
  costUnknown: "—",
  elapsed: "{seconds} s elapsed",
  "confirm.title": "Replace this brief?",
  "confirm.body": "Regenerating makes one model call on your API key and replaces the current brief.",
  "confirm.confirm": "Regenerate",
  "confirm.cancel": "Cancel",
  loadError: "Could not load the brief.",
  retry: "Retry",
  generateError: "Could not generate the brief: {message}",
};

const lookup = (path: string): unknown =>
  path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], brief);

describe("brief.json wording (NFR-11)", () => {
  it.each(Object.entries(SPEC))("%s", (path, expected) => {
    expect(lookup(path)).toBe(expected);
  });
});
