import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Provider } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/agents.json";

// Per-provider catalogues, so the model list must change with the provider.
const MODELS: Record<string, { id: string }[]> = {
  openai: [{ id: "gpt-4.1" }, { id: "gpt-4.1-mini" }],
  anthropic: [{ id: "claude-opus-5" }, { id: "claude-sonnet-5" }],
  openrouter: [],
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../../../../../lib/hooks/agents", () => ({
  useCreateAgent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useProviderModels: (provider: Provider) => ({ data: MODELS[provider] }),
}));

import { CreateAgentModal } from "./CreateAgentModal";

afterEach(cleanup);

function renderModal() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <CreateAgentModal onClose={() => {}} />
    </NextIntlClientProvider>,
  );
}

/** The provider field is the only native <select> in the modal. */
const providerSelect = () => screen.getByRole("combobox");
const pickProvider = (v: Provider) => fireEvent.change(providerSelect(), { target: { value: v } });

describe("Create agent modal — model field", () => {
  it("offers the provider's models instead of free text", () => {
    renderModal();

    fireEvent.click(screen.getByText("gpt-4.1"));
    expect(screen.getByText("gpt-4.1-mini")).toBeInTheDocument();
    expect(screen.queryByText("claude-opus-5")).not.toBeInTheDocument();
  });

  it("swaps the model list when the provider changes", () => {
    renderModal();
    pickProvider("anthropic");

    // The stale OpenAI model is gone; the new provider's first model is picked.
    expect(screen.queryByText("gpt-4.1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("claude-opus-5"));
    expect(screen.getByText("claude-sonnet-5")).toBeInTheDocument();
  });

  it("explains an empty catalogue instead of showing a blank dropdown", () => {
    renderModal();
    pickProvider("openrouter");

    expect(
      screen.getByText("No models loaded — set the openrouter API key in Settings → API Keys."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create agent/ })).toBeDisabled();
  });
});
