"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  Modal,
  FormField,
  TextInput,
  SelectInput,
  SearchableSelect,
  Textarea,
} from "@devdigest/ui";
import type { Provider } from "@devdigest/shared";
import { useCreateAgent, useProviderModels } from "../../../../../../lib/hooks/agents";
import { toModelOptions } from "../../../../../../lib/model-label";
import { DEFAULT_MODEL, DEFAULT_PROVIDER, MODAL_WIDTH, PROVIDER_OPTIONS } from "./constants";
import { s } from "./styles";

/** Create-agent modal — name/description/provider/model/system-prompt. */
export function CreateAgentModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const create = useCreateAgent();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [provider, setProvider] = React.useState<Provider>(DEFAULT_PROVIDER);
  const [model, setModel] = React.useState(DEFAULT_MODEL);
  const [systemPrompt, setSystemPrompt] = React.useState(t("create.defaultSystemPrompt"));

  // Model list is per-provider (same source as the agent editor's Config tab),
  // so switching provider clears the model and the first one loaded takes over.
  const { data: models } = useProviderModels(provider);
  const modelOptions = toModelOptions(models);
  const hasModel = modelOptions.some((o) => (typeof o === "string" ? o : o.value) === model);
  if (model && !hasModel) modelOptions.unshift(model);
  // Empty list after load = provider key missing/invalid (listModels failed) —
  // guide the user instead of showing a silent empty dropdown.
  const noModels = models !== undefined && models.length === 0;

  React.useEffect(() => {
    const first = models?.[0]?.id;
    if (!model && first) setModel(first);
  }, [model, models]);

  const changeProvider = (v: Provider) => {
    setProvider(v);
    setModel("");
  };

  const submit = async () => {
    const agent = await create.mutateAsync({
      name: name.trim() || t("create.defaultName"),
      description,
      provider,
      model,
      system_prompt: systemPrompt,
    });
    onClose();
    router.push(`/agents/${agent.id}?tab=config`);
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={create.isPending || !model}>
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("create.fields.name")} required>
          <TextInput value={name} onChange={setName} placeholder={t("create.fields.namePlaceholder")} />
        </FormField>
        <FormField label={t("create.fields.description")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("create.fields.descriptionPlaceholder")}
          />
        </FormField>
        <FormField label={t("create.fields.provider")}>
          <SelectInput value={provider} onChange={(v) => changeProvider(v as Provider)} options={[...PROVIDER_OPTIONS]} />
        </FormField>
        <FormField
          label={t("create.fields.model")}
          hint={noModels ? t("create.fields.modelEmptyHint", { provider }) : undefined}
        >
          <SearchableSelect
            value={model}
            onChange={setModel}
            options={modelOptions}
            placeholder={t("create.fields.modelSearch")}
          />
        </FormField>
        <FormField label={t("create.fields.systemPrompt")}>
          <Textarea value={systemPrompt} onChange={setSystemPrompt} rows={6} mono />
        </FormField>
      </div>
    </Modal>
  );
}
