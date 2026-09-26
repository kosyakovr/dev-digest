import React from "react";
import { Icon } from "../icons";

type SelectOption = string | { value: string; label: string };
const optValue = (o: SelectOption) => (typeof o === "string" ? o : o.value);
const optLabel = (o: SelectOption) => (typeof o === "string" ? o : o.label);

/**
 * Searchable single-select — same options API as SelectInput, but with a filter
 * box + keyboard nav, for long lists (e.g. the 300+ OpenRouter models). Filters
 * by value and label; Enter selects, ↑/↓ move, Esc closes.
 *
 * With `creatable`, a query matching no option exactly offers a "Create <query>"
 * row that selects the typed text verbatim — for fields whose options are a
 * catalogue the user extends rather than a closed set (e.g. a skill's type).
 * Default off, so an ordinary picker still cannot produce an unlisted value.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Search…",
  mono = true,
  maxHeight = 280,
  creatable = false,
  createLabel = (q: string) => `Create "${q}"`,
}: {
  value: string;
  onChange?: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  mono?: boolean;
  maxHeight?: number;
  /** Allow selecting a value that is not in `options` (see above). */
  creatable?: boolean;
  /** Label for the create row. */
  createLabel?: (query: string) => string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hi, setHi] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setHi(0);
      inputRef.current?.focus();
    }
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) => optValue(o).toLowerCase().includes(q) || optLabel(o).toLowerCase().includes(q),
      )
    : options;

  const current = options.find((o) => optValue(o) === value);
  const currentLabel = current ? optLabel(current) : value || placeholder;

  // Offer creation only for a query that is not already an option — otherwise
  // the list would show "Create rubric" directly above the real `rubric` row.
  const canCreate =
    creatable && q.length > 0 && !options.some((o) => optValue(o).toLowerCase() === q);
  const createValue = query.trim();

  const pick = (o: SelectOption) => {
    onChange?.(optValue(o));
    setOpen(false);
  };
  const create = () => {
    onChange?.(createValue);
    setOpen(false);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = filtered[hi];
      if (o) pick(o);
      // Enter on a query with no match creates it, so typing a new type name and
      // pressing Enter works without reaching for the mouse.
      else if (canCreate) create();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 7,
          border: "1px solid var(--border-strong)",
          background: "var(--bg-elevated)",
          cursor: "pointer",
        }}
      >
        <span
          className={mono ? "mono" : undefined}
          style={{
            flex: 1,
            fontSize: 14,
            color: current || value ? "var(--text-primary)" : "var(--text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {currentLabel}
        </span>
        <Icon.ChevronsUpDown size={14} style={{ color: "var(--text-muted)" }} />
      </div>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            borderRadius: 9,
            boxShadow: "var(--shadow-modal)",
            zIndex: 40,
            overflow: "hidden",
            animation: "ddpop .12s ease",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <Icon.Search size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHi(0);
              }}
              onKeyDown={onKey}
              placeholder={placeholder}
              className={mono ? "mono" : undefined}
              style={{
                flex: 1,
                fontSize: 14,
                color: "var(--text-primary)",
                background: "transparent",
                border: "none",
                outline: "none",
              }}
            />
          </div>
          <div style={{ maxHeight, overflowY: "auto", padding: 6 }}>
            {filtered.length === 0 && !canCreate && (
              <div style={{ padding: "8px 10px", fontSize: 13, color: "var(--text-muted)" }}>
                No matches
              </div>
            )}
            {canCreate && (
              <button
                type="button"
                onClick={create}
                className={mono ? "mono" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: "transparent",
                  color: "var(--accent-text)",
                  fontSize: 13,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <Icon.Plus size={13} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {createLabel(createValue)}
                </span>
              </button>
            )}
            {filtered.map((o, i) => {
              const v = optValue(o);
              const sel = v === value;
              const hot = i === hi;
              return (
                <button
                  key={v}
                  type="button"
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(o)}
                  className={mono ? "mono" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "none",
                    background: hot ? "var(--bg-hover)" : "transparent",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <Icon.Check
                    size={13}
                    style={{ color: sel ? "var(--text-primary)" : "transparent", flexShrink: 0 }}
                  />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {optLabel(o)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
