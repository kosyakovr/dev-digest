/* PreviewDrawer — a doc's preview in a Drawer, with an Attach / Attached toggle. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Drawer } from "@devdigest/ui";
import { useContextFile } from "@/lib/hooks/context";
import { DocPreview } from "@/components/context-docs/DocPreview";

export function PreviewDrawer({
  repoId,
  path,
  attached,
  onToggle,
  onClose,
}: {
  repoId: string | null;
  path: string;
  attached: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("context");
  const { data, isLoading, isError } = useContextFile(repoId, path);
  return (
    <Drawer
      width={560}
      title={t("editor.preview")}
      onClose={onClose}
      footer={
        <Button kind={attached ? "secondary" : "primary"} size="sm" icon={attached ? "Check" : "Plus"} onClick={onToggle}>
          {attached ? t("editor.attached") : t("editor.attachAction")}
        </Button>
      }
    >
      <DocPreview doc={data} loading={isLoading} error={isError} />
    </Drawer>
  );
}
