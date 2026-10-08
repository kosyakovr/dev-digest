"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingTask } from "@devdigest/shared";
import { s } from "./styles";

export function TaskCards({ tasks }: { tasks: OnboardingTask[] }) {
  const t = useTranslations("onboarding");
  if (tasks.length === 0) return null;
  return (
    <ul style={s.list}>
      {tasks.map((task) => (
        <li key={`${task.title}|${task.scope}`} style={s.card}>
          <div style={s.title}>{task.title}</div>
          <div className="mono" style={s.scope}>
            {task.scope}
          </div>
          <div style={s.difficulty}>{t(`difficulty.${task.difficulty}`)}</div>
        </li>
      ))}
    </ul>
  );
}
