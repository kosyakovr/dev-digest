import {
  Onboarding,
  type OnboardingLink,
  type OnboardingSection,
  type OnboardingTask,
  type OnboardingTourState,
} from '@devdigest/shared';
import type { OnboardingIndexFacts } from '../repo-intel/types.js';
import { MAX_DIAGRAM_NODES, MAX_ENDPOINTS_LISTED, MAX_TASKS, SECTION_TITLES } from './constants.js';
import type { TourAnswer, TourPromptInput } from './prompt.js';
import { buildRunSteps, detectStack } from './run-steps.js';

/**
 * L05 onboarding tour — pure core (ring ②): the model-free skeleton, the merge
 * that keeps only model output grounded in it, and the stored-document helpers.
 * No I/O and no await here.
 */

type Edge = { from: string; to: string };
type Clone = { tree: string[]; manifests: Record<string, string> };

const byCountThenName = (a: [string, number], b: [string, number]) =>
  b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

// ---- skeleton -------------------------------------------------------------

/** Top-level directories with their indexed-file counts; root files are not listed. */
function topLevelCounts(files: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const p of files) {
    const i = p.indexOf('/');
    if (i > 0) counts.set(p.slice(0, i), (counts.get(p.slice(0, i)) ?? 0) + 1);
  }
  return [...counts.entries()].sort(byCountThenName);
}

/**
 * A `flowchart LR` of imports between top-level directories (or, when every
 * file sits under one directory, between that directory's subdirectories).
 * `null` with fewer than two nodes. The model writes no diagram (A-10).
 */
export function buildArchitectureDiagram(files: string[], edges: Edge[]): string | null {
  const tops = new Set(files.map((p) => p.split('/')[0]));
  const single = files.length > 0 && files.every((p) => p.includes('/')) && tops.size === 1;
  const nodeOf = (p: string): string | null => {
    const parts = p.split('/');
    if (single) return parts.length > 2 ? `${parts[0]}/${parts[1]}` : null;
    return parts.length > 1 ? parts[0]! : null;
  };
  const counts = new Map<string, number>();
  for (const p of files) {
    const n = nodeOf(p);
    if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const nodes = [...counts.entries()].sort(byCountThenName).slice(0, MAX_DIAGRAM_NODES).map(([n]) => n);
  if (nodes.length < 2) return null;
  const id = new Map(nodes.map((n, i) => [n, `n${i}`]));
  const label = (n: string) => (single ? n.slice(n.indexOf('/') + 1) : n).replaceAll('"', '');
  const lines = ['flowchart LR', ...nodes.map((n) => `  ${id.get(n)}["${label(n)}"]`)];
  const seen = new Set<string>();
  for (const e of edges) {
    const a = nodeOf(e.from);
    const b = nodeOf(e.to);
    if (!a || !b || a === b || !id.has(a) || !id.has(b)) continue;
    const line = `  ${id.get(a)} --> ${id.get(b)}`;
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  return lines.join('\n');
}

function importerCounts(edges: Edge[]): Map<string, number> {
  const importers = new Map<string, Set<string>>();
  for (const e of edges) {
    const set = importers.get(e.to) ?? new Set<string>();
    set.add(e.from);
    importers.set(e.to, set);
  }
  return new Map([...importers].map(([to, set]) => [to, set.size]));
}

function linksFor(paths: string[], imported: Map<string, number>): OnboardingLink[] {
  return paths.map((path) => ({
    label: path,
    path,
    note: `Imported by ${imported.get(path) ?? 0} files`,
  }));
}

function architectureBody(facts: OnboardingIndexFacts, clone: Clone): string {
  const parts: string[] = [];
  const stack = detectStack(clone.tree, clone.manifests);
  if (stack.length > 0) parts.push(`**Stack**\n\n${stack.map((s) => `- ${s}`).join('\n')}`);

  const paths = facts.files.map((f) => f.path);
  const structure = topLevelCounts(paths);
  if (structure.length > 0) {
    parts.push(`**Structure**\n\n${structure.map(([d, n]) => `- \`${d}/\` — ${n} files`).join('\n')}`);
  }

  const endpoints: string[] = [];
  let total = 0;
  for (const f of facts.files) {
    for (const e of facts.endpointsByFile[f.path] ?? []) {
      total += 1;
      if (endpoints.length < MAX_ENDPOINTS_LISTED) endpoints.push(`- \`${e}\` — \`${f.path}\``);
    }
  }
  if (total > 0) parts.push(`**HTTP endpoints** (${total})\n\n${endpoints.join('\n')}`);
  return parts.join('\n\n');
}

/** The five sections, no model. */
export function buildSkeleton(facts: OnboardingIndexFacts, clone: Clone): OnboardingSection[] {
  const imported = importerCounts(facts.edges);
  const chainPaths = [...new Set(facts.criticalPaths.flat())];
  const body: Record<string, Partial<OnboardingSection>> = {
    architecture_overview: {
      body: architectureBody(facts, clone),
      diagram: buildArchitectureDiagram(
        facts.files.map((f) => f.path),
        facts.edges,
      ),
      links: [],
    },
    critical_paths: { body: '', links: linksFor(chainPaths, imported) },
    how_to_run: { body: '', links: [], steps: buildRunSteps(clone.tree, clone.manifests) },
    guided_reading: { body: '', links: linksFor(facts.readingPath, imported) },
    first_tasks: { body: '', links: [] },
  };
  return SECTION_TITLES.map(({ kind, title }) => ({
    kind,
    title,
    body: '',
    links: [],
    ...body[kind],
  }));
}

/** The facts the model is allowed to see (NFR-5), derived from the skeleton. */
export function promptFactsOf(
  facts: OnboardingIndexFacts,
  clone: Clone,
  skeleton: OnboardingSection[],
): Omit<TourPromptInput, 'fullName' | 'readme'> {
  const links = (kind: string) => skeleton.find((s) => s.kind === kind)?.links ?? [];
  const endpoints: string[] = [];
  for (const f of facts.files) {
    for (const e of facts.endpointsByFile[f.path] ?? []) {
      if (endpoints.length < MAX_ENDPOINTS_LISTED) endpoints.push(e);
    }
  }
  return {
    stack: detectStack(clone.tree, clone.manifests),
    structure: topLevelCounts(facts.files.map((f) => f.path)).map(([d, n]) => `${d}/ (${n} files)`),
    endpoints,
    paths: [...new Set([...links('critical_paths'), ...links('guided_reading')].map((l) => l.path))],
    commands: (skeleton.find((s) => s.kind === 'how_to_run')?.steps ?? []).map((s) => s.command),
  };
}

// ---- merge ----------------------------------------------------------------

function applyNotes(links: OnboardingLink[], notes: TourAnswer['reading_notes']) {
  const byPath = new Map<string, string>();
  let dropped = 0;
  const known = new Set(links.map((l) => l.path));
  for (const n of notes) {
    const note = oneLine(n.note);
    if (!known.has(n.path)) dropped += 1;
    else if (note) byPath.set(n.path, note);
  }
  return {
    links: links.map((l) => (byPath.has(l.path) ? { ...l, note: byPath.get(l.path) } : l)),
    dropped,
  };
}

function validScope(scope: string, indexedPaths: Set<string>): boolean {
  if (indexedPaths.has(scope)) return true;
  const slash = scope.lastIndexOf('/');
  const parent = slash === -1 ? '' : scope.slice(0, slash);
  for (const p of indexedPaths) {
    const j = p.lastIndexOf('/');
    if ((j === -1 ? '' : p.slice(0, j)) === parent) return true;
  }
  return false;
}

/**
 * Overlay the model's prose on the skeleton. The model never adds, removes or
 * reorders files or steps: a note whose path/command is not already in the
 * skeleton, and a task whose scope is not grounded (A-12), is dropped.
 */
export function mergeModelAnswer(
  skeleton: OnboardingSection[],
  answer: TourAnswer,
  indexedPaths: Set<string>,
): { sections: OnboardingSection[]; dropped: number } {
  let dropped = 0;
  const sections = skeleton.map((section): OnboardingSection => {
    switch (section.kind) {
      case 'architecture_overview': {
        const overview = answer.overview.trim();
        return { ...section, body: [overview, section.body].filter(Boolean).join('\n\n') };
      }
      case 'critical_paths': {
        const r = applyNotes(section.links, answer.critical_path_notes);
        dropped += r.dropped;
        return { ...section, links: r.links };
      }
      case 'guided_reading': {
        const r = applyNotes(section.links, answer.reading_notes);
        dropped += r.dropped;
        return { ...section, links: r.links };
      }
      case 'how_to_run': {
        const steps = section.steps ?? [];
        const known = new Set(steps.map((s) => s.command));
        const notes = new Map<string, string>();
        for (const n of answer.step_notes) {
          const note = oneLine(n.note);
          if (!known.has(n.command)) dropped += 1;
          else if (note) notes.set(n.command, note);
        }
        return {
          ...section,
          body: answer.how_to_run_body.trim(),
          steps: steps.map((s) => (notes.has(s.command) ? { ...s, note: notes.get(s.command) } : s)),
        };
      }
      case 'first_tasks': {
        const tasks: OnboardingTask[] = [];
        for (const t of answer.tasks) {
          const title = oneLine(t.title);
          const scope = oneLine(t.scope);
          if (title && validScope(scope, indexedPaths) && tasks.length < MAX_TASKS) {
            tasks.push({ title, scope, difficulty: t.difficulty });
          } else {
            dropped += 1;
          }
        }
        return { ...section, tasks };
      }
      default:
        return section;
    }
  });
  return { sections, dropped };
}

// ---- stored document ------------------------------------------------------

/** Removes `\u0000` from every string: jsonb rejects it (server/INSIGHTS.md 2026-10-06). */
export function stripNul<T>(doc: T): T {
  if (typeof doc === 'string') return doc.replaceAll('\u0000', '') as T;
  if (Array.isArray(doc)) return doc.map((v) => stripNul(v)) as T;
  if (doc !== null && typeof doc === 'object') {
    return Object.fromEntries(
      Object.entries(doc as Record<string, unknown>).map(([k, v]) => [k, stripNul(v)]),
    ) as T;
  }
  return doc;
}

export function parseStoredTour(json: unknown): Onboarding | null {
  const parsed = Onboarding.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export function toTourState(
  tour: Onboarding | null,
  currentSha: string | null,
  generating: boolean,
): OnboardingTourState {
  const stale = tour !== null && !!tour.indexed_sha && currentSha !== null && tour.indexed_sha !== currentSha;
  return { tour, generating, stale, current_indexed_sha: currentSha };
}
