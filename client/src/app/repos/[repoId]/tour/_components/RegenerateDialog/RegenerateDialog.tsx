"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { s } from "./styles";

/**
 * Confirms a paid Regenerate over a model-written tour (AC-49). `kit/Modal` has
 * no Escape handling and no initial focus, so this adds both; the caller
 * returns focus to the page's Regenerate button on cancel (AC-50).
 */
export function RegenerateDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("onboarding");
  const confirmRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    confirmRef.current?.querySelector("button")?.focus();
  }, []);

  return (
    // Escape bubbles up from the dialog (focus starts inside it).
    <div
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <Modal
        width={480}
        title={t("confirm.title")}
        onClose={onCancel}
        footer={
          <div style={s.footer}>
            <Button kind="ghost" onClick={onCancel}>
              {t("confirm.cancel")}
            </Button>
            <span ref={confirmRef}>
              <Button kind="primary" onClick={onConfirm}>
                {t("confirm.confirm")}
              </Button>
            </span>
          </div>
        }
      >
        <p style={s.body}>{t("confirm.body")}</p>
      </Modal>
    </div>
  );
}
