import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextItem, SpecFile } from "@devdigest/shared";
import contextMessages from "../../../../messages/en/context.json";

/**
 * Review finding frontend-react (D)-1 / spec L05 AC-18, AC-19: the Context tab's
 * unsaved edits (a tick, a reorder) survive a parent re-render that hands the
 * editor an EQUAL but NEW `items` array — a refetch returning the same server
 * data, or `save.isPending` flipping. Only changed server data may reset them.
 */

const repo = vi.hoisted(() => ({ id: "r1" }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: repo.id,
    activeRepo: { id: repo.id, full_name: "acme/payments-api", default_branch: "main" },
  }),
  useRepoNotFound: () => false,
}));

const docList = vi.hoisted(() => ({ current: [] as SpecFile[] }));
vi.mock("@/lib/hooks/context", () => ({
  useContextFiles: () => ({
    data: docList.current,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useContextSources: () => ({ data: { folders: ["docs", "specs"] } }),
  useContextFile: () => ({ data: undefined, isLoading: false, isError: false }),
}));

import { ContextDocsEditor } from "./ContextDocsEditor";

const doc = (path: string): SpecFile => ({
  path,
  content: null,
  size: 4,
  updated_at: null,
  tokens: 1,
  source: path.split("/").find((seg) => seg === "docs" || seg === "specs") ?? null,
  used_by: null,
});

const tree = (items: ContextItem[]) => (
  <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
    <ContextDocsEditor items={items} saving={false} onSave={() => {}} />
  </NextIntlClientProvider>
);

const box = (path: string) => screen.getByRole("checkbox", { name: `Attach ${path}` });
const order = () => screen.getAllByRole("listitem").map((li) => li.getAttribute("aria-label"));

afterEach(() => cleanup());

describe("ContextDocsEditor — unsaved edits across a re-render with equal items", () => {
  it("keeps a tick when the parent re-renders with a new array holding the same items", () => {
    docList.current = [doc("docs/a.md"), doc("docs/b.md")];
    const { rerender } = render(tree([]));

    expect(box("docs/b.md")).toHaveAttribute("aria-checked", "false");
    fireEvent.click(box("docs/b.md"));
    expect(box("docs/b.md")).toHaveAttribute("aria-checked", "true");

    // A refetch or any parent re-render: a different array object, equal content.
    rerender(tree([]));

    expect(box("docs/b.md")).toHaveAttribute("aria-checked", "true");
    expect(box("docs/a.md")).toHaveAttribute("aria-checked", "false");
  });

  it("keeps a reorder when the parent re-renders with a new array holding the same items", () => {
    docList.current = [doc("specs/a.md"), doc("specs/b.md"), doc("specs/c.md")];
    const saved = (): ContextItem[] => [
      { path: "specs/a.md", position: 0 },
      { path: "specs/b.md", position: 1 },
    ];
    const { rerender } = render(tree(saved()));
    expect(order().slice(0, 2)).toEqual(["specs/a.md", "specs/b.md"]);

    fireEvent.click(screen.getByRole("button", { name: "Move specs/a.md down" }));
    expect(order().slice(0, 2)).toEqual(["specs/b.md", "specs/a.md"]);

    rerender(tree(saved()));

    expect(order().slice(0, 2)).toEqual(["specs/b.md", "specs/a.md"]);
  });
});

/**
 * The other half of "the draft resets only when the saved server data actually
 * changes" (spec L05 AC-18/AC-19, a save round-trips): when `items` genuinely
 * changes, the draft follows the server and the stale unsaved edit is gone.
 */
describe("ContextDocsEditor — the draft follows items that actually change", () => {
  it("drops an unsaved tick when the saved items change to a different selection", () => {
    docList.current = [doc("docs/a.md"), doc("docs/b.md")];
    const { rerender } = render(tree([]));

    fireEvent.click(box("docs/b.md"));
    expect(box("docs/b.md")).toHaveAttribute("aria-checked", "true");

    // The server now holds a different selection (e.g. another tab saved it).
    rerender(tree([{ path: "docs/a.md", position: null }]));

    expect(box("docs/a.md")).toHaveAttribute("aria-checked", "true");
    expect(box("docs/b.md")).toHaveAttribute("aria-checked", "false");
  });

  it("shows exactly the saved data when items becomes the draft the user just saved", () => {
    docList.current = [doc("docs/a.md"), doc("docs/b.md"), doc("docs/c.md")];
    const { rerender } = render(tree([]));

    fireEvent.click(box("docs/b.md"));
    fireEvent.click(box("docs/c.md"));

    // The save succeeded: the server answers with what was sent.
    rerender(tree([{ path: "docs/b.md", position: null }, { path: "docs/c.md", position: null }]));

    expect(box("docs/a.md")).toHaveAttribute("aria-checked", "false");
    expect(box("docs/b.md")).toHaveAttribute("aria-checked", "true");
    expect(box("docs/c.md")).toHaveAttribute("aria-checked", "true");
  });

  it("treats a change of position alone as changed data: the stale tick goes, the new order shows", () => {
    docList.current = [doc("specs/a.md"), doc("specs/b.md"), doc("specs/c.md")];
    const { rerender } = render(
      tree([
        { path: "specs/a.md", position: 0 },
        { path: "specs/b.md", position: 1 },
      ]),
    );

    fireEvent.click(box("specs/c.md"));
    expect(box("specs/c.md")).toHaveAttribute("aria-checked", "true");

    // Same paths in the same array order, swapped positions.
    rerender(
      tree([
        { path: "specs/a.md", position: 1 },
        { path: "specs/b.md", position: 0 },
      ]),
    );

    expect(order().slice(0, 2)).toEqual(["specs/b.md", "specs/a.md"]);
    expect(box("specs/c.md")).toHaveAttribute("aria-checked", "false");
  });
});
