/* BlastTree — one collapsible block per changed symbol: its callers (file:line,
   direct and indirect), then the HTTP endpoints and crons they reach. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, MonoLink } from "@devdigest/ui";
import type { BlastCaller, DownstreamImpact } from "@devdigest/shared";
import { callerHref } from "../../helpers";
import { s } from "./styles";

const INDENT_PX = 18;

interface LinkProps {
  repoFullName: string | null | undefined;
  sha: string | null;
}

function CallerRow({ caller, repoFullName, sha }: LinkProps & { caller: BlastCaller }) {
  const t = useTranslations("blast");
  const depth = caller.depth ?? 1;
  const href = callerHref(repoFullName, sha, caller);
  const location = `${caller.file}:${caller.line}`;
  return (
    <div style={{ ...s.caller, paddingLeft: depth * INDENT_PX }}>
      <span>{caller.name}</span>
      {href ? <MonoLink href={href}>{location}</MonoLink> : <span className="mono">{location}</span>}
      {depth >= 2 && caller.through && (
        <span style={s.via}>
          <Icon.CornerDownRight size={12} />
          {t("via", { name: caller.through })}
        </span>
      )}
    </div>
  );
}

function SymbolGroup({
  item,
  open,
  onToggle,
  repoFullName,
  sha,
}: LinkProps & { item: DownstreamImpact; open: boolean; onToggle: () => void }) {
  const t = useTranslations("blast");
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;
  return (
    <div>
      <button type="button" style={s.header} aria-expanded={open} onClick={onToggle}>
        <Chevron size={14} />
        <Icon.Code size={14} />
        <span className="mono" style={s.symbol}>{item.symbol}</span>
        <span style={s.count}>{t("count.callers", { count: item.callers.length })}</span>
      </button>
      {open && (
        <div style={s.body}>
          {item.callers.map((c) => (
            <CallerRow
              key={`${c.file}:${c.line}:${c.depth ?? 1}:${c.name}`}
              caller={c}
              repoFullName={repoFullName}
              sha={sha}
            />
          ))}
          {(item.endpoints_affected.length > 0 || item.crons_affected.length > 0) && (
            <div style={s.badges}>
              {item.endpoints_affected.map((e) => (
                <Badge key={`e:${e}`} mono icon="Globe">{e}</Badge>
              ))}
              {item.crons_affected.map((k) => (
                <Badge key={`c:${k}`} mono icon="Clock">{k}</Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BlastTree({ downstream, repoFullName, sha }: LinkProps & { downstream: DownstreamImpact[] }) {
  // Only the first symbol is open until the user toggles another.
  const [toggled, setToggled] = React.useState<Record<string, boolean>>({});
  return (
    <div style={s.tree}>
      {downstream.map((item, i) => {
        const open = toggled[item.symbol] ?? i === 0;
        return (
          <SymbolGroup
            key={item.symbol}
            item={item}
            open={open}
            onToggle={() => setToggled((prev) => ({ ...prev, [item.symbol]: !open }))}
            repoFullName={repoFullName}
            sha={sha}
          />
        );
      })}
    </div>
  );
}
