# Examples — frontend UI architecture

Good/bad pairs for [SKILL.md](SKILL.md). Paths are from `client/` in this repo; the
rules themselves are project-independent.

## 1. Placing a new component

A severity filter bar needed only by the PR detail page.

**Bad — dumped into the shared folder "because it might be reused"**

```
src/components/SeverityFilterBar.tsx
```

Nothing else imports it, the shared folder grows, and the PR page's feature set is no
longer visible from its own folder.

**Good — route-local until a second route needs it**

```
src/app/repos/[repoId]/pulls/[number]/_components/SeverityFilterBar/
├── SeverityFilterBar.tsx
├── constants.ts
├── styles.ts
└── index.ts
```

When the PR *list* page later needs the same bar, promote it:

```
src/components/severity-filter/SeverityFilterBar/…
```

…and update both consumers. Promotion is a real commit, not a prediction.

## 2. Component folder: complete vs padded

**Bad — files created up front, most of them empty**

```
FindingCard/
├── FindingCard.tsx
├── constants.ts      # export {}
├── helpers.ts        # empty
├── types.ts          # empty
├── styles.ts         # empty
└── index.ts
```

**Good — only what has content** (`.../pulls/[number]/_components/FindingCard/`)

```
FindingCard/
├── FindingCard.tsx
├── FindingCard.test.tsx
├── constants.ts      # SEV_COLOR, SEV_COLOR_FALLBACK
├── helpers.ts        # lineLabel()
├── styles.ts         # s.card, s.header, …
└── index.ts          # export { FindingCard, FindingCard as default } from "./FindingCard";
```

Compare `DiffTab/`, which legitimately has only `DiffTab.tsx` + `index.ts`.

## 3. Extracting a helper

**Bad — logic inside the component body, re-created every render, untestable alone**

```tsx
export function FindingCard({ f }: Props) {
  const lineLabel = () =>
    f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
  return <MonoLink>{lineLabel()}</MonoLink>;
}
```

**Good — a pure function in `helpers.ts`, arguments in, value out**

```ts
// helpers.ts
import type { FindingRecord } from "@devdigest/shared";

/** Format a finding's line range ("11" when single-line, else "11-15"). */
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}
```

```tsx
// FindingCard.tsx
import { lineLabel } from "./helpers";
…
<MonoLink>{lineLabel(f)}</MonoLink>
```

Note the signature takes `Pick<…>`, not the whole record — the helper states exactly
what it needs and the test can pass two numbers.

## 4. Render function → real component

**Bad — a closure pretending to be a component**

```tsx
export function FindingsPanel({ findings }: Props) {
  const renderFinding = (f: FindingRecord) => (
    <div style={{ borderLeftColor: SEV_COLOR[f.severity] }}>
      {f.title}
      {expanded === f.id ? <Markdown>{f.rationale}</Markdown> : null}
    </div>
  );
  return <>{findings.map(renderFinding)}</>;
}
```

It cannot be memoized, tested, or reused, and it silently closes over `expanded`.

**Good — a named component with explicit props**

```tsx
export function FindingsPanel({ findings, expandedId, onToggle }: Props) {
  return (
    <>
      {findings.map((f) => (
        <FindingCard key={f.id} f={f} expanded={f.id === expandedId} onToggle={onToggle} />
      ))}
    </>
  );
}
```

## 5. Imports: alias, not a relative ladder

**Bad** (this exact line exists in `FindingCard.tsx` and 58 others like it)

```ts
import { githubBlobUrl } from "../../../../../../../lib/github-urls";
```

Seven levels up is unreadable, breaks on any move, and hides that this is a
`lib` dependency.

**Good** — `@/*` is already configured in `client/tsconfig.json`

```ts
import { githubBlobUrl } from "@/lib/github-urls";
```

Rule of thumb: `./x` and `../x` are fine, `../../x` is borderline, anything deeper is
either an alias or a misplaced file.

## 6. No `utils/`

**Bad**

```
src/lib/utils.ts
```

```ts
export function formatCost(usd: number | null) { … }
export function githubBlobUrl(repo: string, sha: string, path: string) { … }
export function modelLabel(m: PricedModel) { … }
export function debounce(fn: Function, ms: number) { … }
```

Four unrelated concerns, one file, no owner. Every new "small function" lands here
because nothing in the name excludes it.

**Good** — what this repo actually does

```
src/lib/format.ts        # formatCost, formatTokensTotal (roundTo stays private here)
src/lib/github-urls.ts   # githubBlobUrl, …
src/lib/model-label.ts   # modelLabel, toModelOptions
```

Each module is named after a concern, so "does this belong here?" has an answer.

Note `roundTo` in `format.ts`: a helper used only by that module is **not** exported.
A module's public surface is what others need, not everything it contains.

## 7. `helpers.ts` vs `lib/`

| Function | Where | Why |
|---|---|---|
| `lineLabel(finding)` | `FindingCard/helpers.ts` | only this card formats a line range |
| `formatCost(usd)` | `lib/format.ts` | every money surface needs it |
| the configured fetch wrapper | `lib/api.ts` | infrastructure, not a pure helper |
| `usePrReviews(prId)` | `lib/hooks/reviews.ts` | server state, needs React |

The test: could this function move to another project unchanged? Then it is `lib/`.
Does it know about *this* feature? Then it stays in the feature's `helpers.ts`.

## 8. Constants: local by default

**Bad — global junk drawer**

```ts
// src/constants.ts
export const SEV_COLOR = { … };
export const POLL_INTERVAL_MS = 4000;
export const MAX_DIFF_LINES = 2000;
export const SHELL_SHORTCUT_PREFIX = "g";
```

**Good — next to the owner**

```ts
// app/.../_components/FindingCard/constants.ts
export const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
  INFO: "var(--info)",
};
export const SEV_COLOR_FALLBACK = "var(--text-muted)";
```

```ts
// src/components/app-shell/constants.ts  — owned by the shell, used by its hooks
/** Window (ms) to press the second key of a `g`-then-key navigation chord. */
export const G_NAV_TIMEOUT_MS = 1200;
```

Both files also show the other half of the rule: a constant carries a comment saying
what it means, so the next reader does not have to guess why 1200.

## 9. `as const` over `enum`

**Bad**

```ts
export enum Severity { Critical = "CRITICAL", Warning = "WARNING" }
```

Emits runtime code, cannot be type-stripped, and the values already exist in the
shared contract.

**Good**

```ts
export const SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION", "INFO"] as const;
export type Severity = (typeof SEVERITIES)[number];
```

Better still when it crosses the network: derive it from the shared Zod contract in
`src/vendor/shared/contracts/` instead of re-declaring it.

## 10. Business logic out of the component

**Bad — fetch, decision and rendering in one place**

```tsx
export function RunHistory({ pullId }: Props) {
  const [runs, setRuns] = useState<Run[]>([]);
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_BASE}/pulls/${pullId}/reviews`)
      .then((r) => r.json())
      .then(setRuns);
  }, [pullId]);

  const worst = runs.flatMap((r) => r.findings)
    .reduce((acc, f) => (SEV_RANK[f.severity] > SEV_RANK[acc] ? f.severity : acc), "INFO");
  …
}
```

Three violations: `fetch` in a component, `process.env` in the UI, and a business rule
(what "worst severity" means) buried in a render function.

**Good — three layers, each testable**

```ts
// src/lib/hooks/reviews.ts        — server state
export function usePrReviews(prId: string) { … }

// RunHistory/helpers.ts           — the business rule, pure
export function worstSeverity(findings: FindingRecord[]): Severity { … }
```

```tsx
// RunHistory.tsx                  — orchestration only
export function RunHistory({ pullId }: Props) {
  const { data: runs = [] } = usePrReviews(pullId);
  const worst = worstSeverity(runs.flatMap((r) => r.findings));
  return <SeverityBadge severity={worst} />;
}
```

## 11. State: local, then lifted to the nearest owner

**Bad — one page-level state bag**

```tsx
const [state, setState] = useState({
  activeTab: "overview", expandedFindingId: null,
  isTraceDrawerOpen: false, severityFilter: "ALL", copiedId: null,
});
```

Every keystroke re-renders the whole page, and nothing tells you which component owns
what.

**Good** — `activeTab` in the page (two tabs read it), `expandedFindingId` in
`FindingsPanel` (only its cards care), `copiedId` inside the button that copies. State
sits with the component that uses it; it is lifted exactly one level when a sibling
needs it too.

## 12. Server data stays in the query cache

**Bad**

```tsx
const { data } = usePrReviews(pullId);
useEffect(() => { if (data) reviewStore.setReviews(data); }, [data]);
```

Two sources of truth; background refetches no longer reach the UI.

**Good**

```tsx
const { data: reviews = [] } = usePrReviews(pullId);
```

Read it where you need it. Derive, don't copy.

## 13. Next.js: thin page

**Bad — the page is the feature**

```tsx
export default async function PullPage({ params }) {
  const { repoId, number } = await params;
  // 200 lines: tabs, filters, drawer state, markdown rendering…
}
```

**Good** — the page resolves params and composes

```tsx
export default async function PullPage({ params }: { params: Promise<Params> }) {
  const { repoId, number } = await params;
  return <PrDetailView repoId={repoId} number={Number(number)} />;
}
```

…with `PrDetailHeader`, `OverviewTab`, `DiffTab`, `FindingsTab` living in
`_components/`, exactly as `app/repos/[repoId]/pulls/[number]/` already does.

## 14. Next.js: `"use client"` on the leaf

**Bad — the directive on a layout or a big wrapper**

```tsx
"use client";
export default function PullLayout({ children }) {
  return <PageShell>{children}</PageShell>;
}
```

Everything below it, including purely presentational subtrees, is pulled into the
client bundle.

**Good — server shell, client leaf**

```tsx
// page.tsx — Server Component
export default async function Page() {
  const findings = await getFindings();          // data-access layer
  return (
    <FindingsPanel findings={findings}>
      <RunReviewDropdown />                       {/* the only interactive part */}
    </FindingsPanel>
  );
}
```

```tsx
// RunReviewDropdown/RunReviewDropdown.tsx
"use client";
export function RunReviewDropdown() { … }
```

A Server Component passed as `children` to a Client Component stays on the server —
only *imports* cross the boundary, not nesting.

## 15. Next.js: thin server action over a data-access layer

**Bad — authorization and SQL inside the action**

```ts
"use server";
export async function dismissFinding(id: string) {
  const user = await getSession();               // no check on the result
  await db.update(findings).set({ dismissed: true }).where(eq(findings.id, id));
}
```

Anyone who can call the action can dismiss any finding.

**Good — the action validates and delegates; the DAL authorizes**

```ts
// lib/data/findings.ts
import "server-only";
export async function dismissFinding(findingId: string) {
  const user = await requireUser();
  await assertCanEditFinding(user, findingId);   // ownership check, server-side
  await db.update(findings).set({ dismissed: true }).where(eq(findings.id, findingId));
}
```

```ts
// app/repos/[repoId]/pulls/[number]/actions.ts
"use server";
import { dismissFinding } from "@/lib/data/findings";

export async function dismissFindingAction(findingId: string) {
  const id = z.string().uuid().parse(findingId);  // shape only
  await dismissFinding(id);                       // identity re-read from the session
  revalidatePath(`/repos`);
}
```

Send an id plus the change; never trust a user id, role or price sent from the client.

## 16. Barrels: per component, not per folder

**Bad — a group-wide mega-barrel**

```ts
// src/components/index.ts
export * from "./app-shell";
export * from "./diff-viewer";
export * from "./finding-preview";
export * from "./mermaid-diagram";   // pulls mermaid into any consumer's graph
```

One import of a small badge drags the whole graph in, and `export *` hides what exists.

**Good — one component, one line**

```ts
// src/components/finding-preview/index.ts
export { FindingPreview } from "./FindingPreview";
```

The legitimate mega-barrel is a package's public API: `src/vendor/ui/index.ts` →
`@devdigest/ui`, which is the documented entry point for the design system.

## 17. Cross-feature import → compose at the route

**Bad** — what the PR list cell could have done (it does not)

```ts
// app/repos/[repoId]/pulls/_components/FindingsCell/FindingsCell.tsx
import { FindingCard } from "../../[number]/_components/FindingCard";
```

Reaching into another route's private folder. Now neither route can move.

**Good** — what it actually does: the shared part was promoted once, both routes import it

```ts
import { FindingPreview } from "@/components/finding-preview";
```

`FindingPreview` exists precisely because two surfaces needed a read-only finding view
— the PR list popover and the trace drawer.
