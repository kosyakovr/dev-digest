/* CreateSkillModal — turn the selected conventions into a skill.
   The server assembles a DRAFT (persisting nothing); the user edits it here and
   only `POST /skills` stores it — the same preview-then-confirm flow as import. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, TextInput, Textarea } from "@devdigest/ui";
import { useCreateSkill } from "@/lib/hooks/skills";
import { useConventionSkillDraft } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { SkillTypeSelect } from "@/components/skill-type-select";
import { CREATE_SKILL_MODAL_WIDTH } from "../../constants";
import { s } from "./styles";

export interface CreateSkillModalProps {
  repoId: string;
  ids: string[];
  onClose: () => void;
}

export function CreateSkillModal({ repoId, ids, onClose }: CreateSkillModalProps) {
  const t = useTranslations("conventions");
  const router = useRouter();
  const toast = useToast();
  const draft = useConventionSkillDraft();
  const create = useCreateSkill();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState("convention");
  const [body, setBody] = React.useState("");

  // The draft arrives async and seeds the form exactly ONCE — a re-seed would
  // throw away whatever the user has already typed.
  const seeded = React.useRef(false);
  const { mutateAsync: buildDraft } = draft;
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const d = await buildDraft({ repoId, ids }).catch(() => null);
      if (cancelled || !d || seeded.current) return;
      seeded.current = true;
      setName(d.name);
      setDescription(d.description);
      setType(d.type);
      setBody(d.body);
    })();
    return () => {
      cancelled = true;
    };
  }, [buildDraft, repoId, ids]);

  const canSubmit = name.trim().length > 0 && type.trim().length > 0 && body.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    const skill = await create.mutateAsync({
      name: name.trim(),
      description: description.trim(),
      type: type.trim(),
      body,
    });
    toast.success(t("modal.created", { count: ids.length }));
    onClose();
    router.push(`/skills/${skill.id}?tab=config`);
  };

  return (
    <Modal
      width={CREATE_SKILL_MODAL_WIDTH}
      title={t("modal.title")}
      subtitle={t("modal.subtitle", { count: ids.length })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Plus"
            onClick={submit}
            disabled={!canSubmit || create.isPending}
          >
            {create.isPending ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      }
    >
      {draft.isPending && !seeded.current ? (
        <div style={s.state}>{t("modal.loading")}</div>
      ) : draft.isError && !seeded.current ? (
        <div style={s.error}>{t("modal.draftFailed")}</div>
      ) : (
        <div style={s.body}>
          <FormField label={t("modal.name")} required>
            <TextInput value={name} onChange={setName} />
          </FormField>
          <FormField label={t("modal.description")}>
            <TextInput value={description} onChange={setDescription} />
          </FormField>
          <FormField label={t("modal.type")} required>
            <SkillTypeSelect value={type} onChange={setType} />
          </FormField>
          <FormField label={t("modal.body")} required>
            <Textarea value={body} onChange={setBody} rows={14} mono />
          </FormField>
        </div>
      )}
    </Modal>
  );
}
