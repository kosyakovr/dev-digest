"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { IconBtn } from "@devdigest/ui";
import type { OnboardingStep } from "@devdigest/shared";
import { COPY_FEEDBACK_MS } from "@/app/repos/[repoId]/tour/constants";
import { s } from "./styles";

type CopyState = "idle" | "copied" | "failed";

function StepRow({ step }: { step: OnboardingStep }) {
  const t = useTranslations("onboarding");
  const [copy, setCopy] = React.useState<CopyState>("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onCopy = async () => {
    let next: CopyState = "copied";
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(step.command);
    } catch {
      next = "failed";
    }
    setCopy(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopy("idle"), COPY_FEEDBACK_MS);
  };

  return (
    <li style={s.item}>
      <div style={s.row}>
        <code className="mono" style={s.command}>
          {step.command}
        </code>
        <IconBtn
          icon={copy === "copied" ? "Check" : "Copy"}
          label={t("copy.label", { command: step.command })}
          onClick={() => void onCopy()}
        />
        {copy === "copied" && <span style={s.feedback}>{t("copy.copied")}</span>}
      </div>
      {copy === "failed" && <div style={s.failed}>{t("copy.failed")}</div>}
      {step.note && <div style={s.note}>{step.note}</div>}
    </li>
  );
}

export function RunSteps({ steps }: { steps: OnboardingStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ol style={s.list}>
      {steps.map((step) => (
        <StepRow key={step.command} step={step} />
      ))}
    </ol>
  );
}
