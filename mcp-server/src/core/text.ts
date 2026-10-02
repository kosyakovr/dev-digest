/**
 * Ring ①: two pure string helpers shared by the use cases and the renderer so
 * neither ring has to import the other. No imports.
 */

/** Cut to at most `max` chars; the last char becomes an ellipsis when cut. */
export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value;
}

/** Collapse every run of whitespace (newlines included) to one space. */
export function collapseToOneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
