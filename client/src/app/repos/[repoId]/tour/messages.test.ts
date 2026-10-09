import { describe, it, expect } from "vitest";
import messages from "../../../../../messages/en/onboarding.json";

/**
 * NFR-11 is an inspection requirement ("message strings equal the pinned
 * texts"); this makes it a test. The expected strings are copied from the
 * spec, character for character (en dash, em dash, curly apostrophe, ellipsis).
 * Keys are the ones the plan fixes in WP7 step 1.
 */
const lookup = (key: string): unknown =>
  key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages);

const PINNED: Record<string, string> = {
  "generate.title": "Generate onboarding tour",
  "generate.cta": "Generate onboarding tour",
  "generate.body":
    "DevDigest indexes the repo and writes a guided tour: architecture, critical paths, how to run, a reading order, and first tasks. Takes 30–60s and ~5,000 tokens.",
  "generate.generating": "Generating…",
  regenerate: "Regenerate",
  regenerating: "Regenerating…",
  pendingHint: "This usually takes 30–60 s.",
  elapsed: "{seconds} s elapsed",
  "header.title": "Onboarding for {repo}",
  "header.meta": "Generated from index of {files} files · last refreshed {time}",
  "header.metaModel": "Generated from index of {files} files · last refreshed {time} · {model}",
  toc: "On this page",
  loading: "Loading onboarding tour…",
  notFound: "Repository not found",
  "loadError.title": "Couldn’t load the onboarding tour",
  "notice.indexUnavailable":
    "Skeleton only — the repository index is unavailable ({reason}). Re-index the repository, then Regenerate.",
  "notice.reason.flag_off": "repo intelligence is turned off",
  "notice.reason.no_data": "the repository is not indexed yet",
  "notice.reason.index_failed": "indexing failed",
  "notice.reason.repo_too_large": "the repository is too large to index",
  "notice.llmUnavailable":
    "Skeleton only — no API key is set for the onboarding model. Add one in Settings → API Keys, then Regenerate.",
  "notice.llmFailed": "Skeleton only — the model call failed. Regenerate to try again.",
  "notice.llmTimeout": "Skeleton only — the model did not answer within 120 s. Regenerate to try again.",
  "notice.partial":
    "The index is partial — some files were skipped, so this tour may miss parts of the repository.",
  "notice.stale":
    "Out of date — the index moved from {tourSha} to {currentSha} after this tour was generated. Regenerate to update it.",
  "section.empty": "The index has nothing for this section.",
  "section.firstTasksSkeleton": "First tasks are written by the model. Regenerate once the model is available.",
  "difficulty.low": "Low complexity",
  "difficulty.medium": "Medium complexity",
  "copy.label": "Copy command: {command}",
  "copy.copied": "Copied!",
  "copy.failed": "Couldn’t copy — select the command and copy it by hand.",
  "confirm.title": "Replace this onboarding tour?",
  "confirm.body":
    "Regenerating makes one model call on your API key and replaces the current tour. Takes 30–60s and ~5,000 tokens.",
  "confirm.confirm": "Regenerate",
  "confirm.cancel": "Cancel",
};

describe("onboarding.json — pinned wording (NFR-11)", () => {
  it.each(Object.entries(PINNED))("%s", (key, expected) => {
    expect(lookup(key)).toBe(expected);
  });
});
