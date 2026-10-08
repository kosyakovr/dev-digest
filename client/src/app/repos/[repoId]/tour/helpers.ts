/** Pure helpers for the Onboarding Tour page. */

import type { OnboardingSection, OnboardingSectionKind } from "@devdigest/shared";
import { SHORT_SHA_LENGTH, UNAVAILABLE_REASONS, type UnavailableReason } from "./constants";

/** A SHA in short form (A-32). */
export function shortSha(sha: string): string {
  return sha.slice(0, SHORT_SHA_LENGTH);
}

/** The id of a section card, used by "On this page" to scroll to it. */
export function sectionId(kind: string): string {
  return `tour-section-${kind}`;
}

/** The id of a section's collapsible content (`aria-controls`). */
export function sectionBodyId(kind: string): string {
  return `${sectionId(kind)}-body`;
}

/** Map a stored `index_reason` to a pinned wording; anything else reads as "indexing failed". */
export function unavailableReason(reason: string | null | undefined): UnavailableReason {
  return (UNAVAILABLE_REASONS as readonly string[]).includes(reason ?? "")
    ? (reason as UnavailableReason)
    : "index_failed";
}

/** R-35: whether a section has nothing to show. First tasks never counts as empty. */
export function isSectionEmpty(section: OnboardingSection): boolean {
  // Narrowed to the contract's union, so a case label it does not contain is a compile error.
  switch (section.kind as OnboardingSectionKind) {
    case "architecture_overview":
      return !section.body.trim() && !section.diagram?.trim();
    case "critical_paths":
    case "guided_reading":
      return section.links.length === 0;
    case "how_to_run":
      return (section.steps?.length ?? 0) === 0;
    default:
      return false;
  }
}

/** Link targets the tour allows: http(s) and in-page anchors. Anything else becomes "". */
export function safeUrl(url: string): string {
  return /^(https?:\/\/|#)/i.test(url.trim()) ? url : "";
}

/** Whole seconds between a start timestamp and now. */
export function elapsedSeconds(startedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}
