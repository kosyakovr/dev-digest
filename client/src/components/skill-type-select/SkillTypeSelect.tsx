/* SkillTypeSelect — the skill "type" dropdown: pick an existing type or type a
   new one. The catalogue lives in `skill_types`; a name typed here is persisted
   by the server when the skill is saved, so nothing is created on selection. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SearchableSelect } from "@devdigest/ui";
import { useSkillTypes } from "@/lib/hooks/skills";

export function SkillTypeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations("skills");
  const { data: types } = useSkillTypes();

  // Include the current value even when the catalogue has not loaded yet (or the
  // skill carries a type someone has since removed), so the field never renders
  // blank and a save cannot silently drop the type.
  const options = React.useMemo(() => {
    const names = (types ?? []).map((x) => x.name);
    return value && !names.includes(value) ? [...names, value] : names;
  }, [types, value]);

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={t("config.typePlaceholder")}
      creatable
    />
  );
}
