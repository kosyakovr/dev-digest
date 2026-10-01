/** Constants for the DiffViewer. */
import type { Severity } from "@devdigest/shared";

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Sort rank of a severity (lower = more severe). */
export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

/** Severity → i18n key (shell namespace) of the label on a line that carries findings. */
export const SEVERITY_LINE_LABEL_KEY = {
  CRITICAL: "diffViewer.findingLine.critical",
  WARNING: "diffViewer.findingLine.warning",
  SUGGESTION: "diffViewer.findingLine.suggestion",
} as const satisfies Record<Severity, string>;
