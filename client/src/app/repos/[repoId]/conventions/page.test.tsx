import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../messages/en/conventions.json";
import skillMessages from "../../../../../messages/en/skills.json";

const extractMutateAsync = vi.fn();
const draftMutateAsync = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();
let conventions: ConventionCandidate[] = [];
let extractData: unknown = undefined;
let extractPending = false;

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    activeRepo: { id: "r1", full_name: "acme/payments-api", default_branch: "main" },
  }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({
    data: conventions,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useExtractConventions: () => ({
    mutateAsync: extractMutateAsync,
    isPending: extractPending,
    data: extractData,
  }),
  useUpdateConvention: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteConvention: () => ({ mutate: deleteMutate, isPending: false }),
  useConventionSkillDraft: () => ({
    mutateAsync: draftMutateAsync,
    isPending: false,
    isError: false,
  }),
}));
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSkillTypes: () => ({ data: [{ id: "t1", name: "convention" }] }),
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import ConventionsPage from "./page";

const c = (over: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id: "c1",
  repo_id: "r1",
  rule: "Validate request bodies with a Zod schema.",
  rationale: null,
  category: "typing",
  evidence_path: "src/user.ts",
  evidence_line: 3,
  evidence_snippet: "export const UserSchema = z.object({",
  confidence: 0.8,
  status: "pending",
  created_at: "2026-09-22T10:00:00.000Z",
  ...over,
});

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ conventions: messages, skills: skillMessages }}>
        <ConventionsPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  conventions = [];
  extractData = undefined;
  extractPending = false;
  vi.clearAllMocks();
  draftMutateAsync.mockResolvedValue({
    name: "payments-api-conventions",
    description: "1 house convention extracted from acme/payments-api",
    type: "convention",
    body: "# payments-api-conventions",
    evidence_files: ["src/user.ts"],
    convention_ids: ["c1"],
  });
});
afterEach(cleanup);

describe("Conventions page", () => {
  it("offers a scan and nothing else before the first extraction", () => {
    renderPage();
    expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
    // The same action sits in the header and in the empty state's CTA.
    expect(screen.getAllByRole("button", { name: "Run extraction" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("runs the scan from either the header or the empty state", async () => {
    renderPage();
    const [header, cta] = screen.getAllByRole("button", { name: "Run extraction" });
    fireEvent.click(header!);
    await waitFor(() => expect(extractMutateAsync).toHaveBeenCalledWith("r1"));
    fireEvent.click(cta!);
    await waitFor(() => expect(extractMutateAsync).toHaveBeenCalledTimes(2));
  });

  it("reports what the evidence gate dropped, so a short list reads as working", () => {
    conventions = [c()];
    extractData = {
      candidates: conventions,
      proposed: 12,
      dropped_ungrounded: 9,
      dropped_duplicate: 2,
      sampled_files: 17,
      model: "deepseek-v4-flash",
      cost_usd: 0.0012,
    };
    renderPage();
    const summary = screen.getByRole("status");
    expect(summary).toHaveTextContent("12 proposed");
    expect(summary).toHaveTextContent("9 dropped by the evidence gate");
    expect(summary).toHaveTextContent("2 already known");
    expect(summary).toHaveTextContent("17 files sampled");
    expect(summary).toHaveTextContent("deepseek-v4-flash · $0.0012");
  });

  it("names the model but no price when the cost is unknown", () => {
    conventions = [c()];
    extractData = {
      candidates: conventions,
      proposed: 1,
      dropped_ungrounded: 0,
      dropped_duplicate: 0,
      sampled_files: 3,
      model: "gpt-5.4",
      cost_usd: null,
    };
    renderPage();
    expect(screen.getByRole("status")).not.toHaveTextContent("$");
  });

  it("counts every triage chip and narrows the list to one status", () => {
    conventions = [
      c({ id: "a", status: "pending" }),
      c({ id: "b", status: "accepted", rule: "Log errors once." }),
      c({ id: "d", status: "rejected", rule: "Prefix selectors with osf." }),
    ];
    renderPage();
    expect(screen.getByRole("button", { name: "All 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accepted 1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Rejected 1" }));
    expect(screen.getByText("Prefix selectors with osf.")).toBeInTheDocument();
    expect(screen.queryByText("Log errors once.")).not.toBeInTheDocument();
  });

  it("says so when a filter matches nothing", () => {
    conventions = [c({ status: "pending" })];
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Accepted 0" }));
    expect(screen.getByText("No conventions with this status.")).toBeInTheDocument();
  });

  it("gates Create skill on a selection and opens the modal with the selected ids", async () => {
    conventions = [c()];
    renderPage();
    const create = screen.getByRole("button", { name: "Create skill" });
    expect(create).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Select Validate request bodies with a Zod schema."));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(create).toBeEnabled();

    fireEvent.click(create);
    await waitFor(() =>
      expect(screen.getByText("Create skill from conventions")).toBeInTheDocument(),
    );
  });

  it("routes a card's triage straight to the update mutation", () => {
    conventions = [c()];
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(updateMutate).toHaveBeenCalledWith({
      id: "c1",
      repoId: "r1",
      patch: { status: "accepted" },
    });
  });

  it("labels the scan button as a re-scan once the board has candidates", () => {
    conventions = [c()];
    renderPage();
    expect(screen.getByRole("button", { name: "Re-scan" })).toBeInTheDocument();
  });
});
