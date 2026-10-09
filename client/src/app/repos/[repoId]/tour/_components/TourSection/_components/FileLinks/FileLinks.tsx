"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingLink } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

export function FileLinks({
  links,
  repoName,
  sha,
}: {
  links: OnboardingLink[];
  repoName: string;
  /** The tour's own SHA, so links stay correct when the index has moved on. */
  sha: string;
}) {
  const t = useTranslations("onboarding");
  if (links.length === 0) return null;
  return (
    <ul style={s.list}>
      {links.map((link) => (
        <li key={link.path} style={s.item}>
          <div style={s.main}>
            <span className="mono" style={s.path}>
              {link.label}
            </span>
            {link.note && <span style={s.note}>{link.note}</span>}
          </div>
          <a
            href={githubBlobUrl(repoName, sha, link.path)}
            target="_blank"
            rel="noopener noreferrer"
            style={s.open}
          >
            {t("open")}
          </a>
        </li>
      ))}
    </ul>
  );
}
