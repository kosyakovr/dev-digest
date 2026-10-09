"use client";

import React from "react";
import { Button, Modal } from "@devdigest/ui";
import { s } from "./styles";

/**
 * A confirm / cancel dialog for a paid action. `kit/Modal` has no Escape
 * handling and no initial focus, so this adds both; the caller decides where
 * focus goes after a cancel. Every label is a prop (no domain knowledge here).
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
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
        title={title}
        onClose={onCancel}
        footer={
          <div style={s.footer}>
            <Button kind="ghost" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <span ref={confirmRef}>
              <Button kind="primary" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </span>
          </div>
        }
      >
        <p style={s.body}>{body}</p>
      </Modal>
    </div>
  );
}
