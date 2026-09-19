/**
 * Shared value formatters. Pure — no React, no i18n.
 *
 * These return `null` for "nothing to show" rather than a placeholder string,
 * because the placeholder ("n/a", "—") is a UI string and belongs in
 * `messages/` or in the component, not in a formatter.
 */

/**
 * Round half-up at `digits`, correcting for binary float representation.
 *
 * `toFixed` alone rounds the BINARY value, not the decimal one it looks like:
 * `(1.005).toFixed(2)` is "1.00" and `(0.145).toFixed(2)` is "0.14", because
 * those literals are stored a hair below the half. Scaling and re-reading the
 * number at 12 significant digits drops that noise before the round — which
 * matters here because a PR's cost arrives as a Postgres `SUM()` over
 * `double precision` and lands on values like 0.012000000000000002.
 */
function roundTo(n: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(Number((n * factor).toPrecision(12))) / factor;
}

/**
 * USD cost with adaptive precision: under a cent keeps 4 decimals so a
 * sub-cent run never collapses to a misleading "$0.00".
 *
 * `null`/`undefined` means UNKNOWN (unpriced model, or a run that failed
 * before its first LLM call) and returns null — it is never "$0.00", which
 * would read as "this run was free".
 */
export function formatCost(usd: number | null | undefined): string | null {
  if (usd == null || Number.isNaN(usd)) return null;
  if (usd === 0) return "$0.00";
  return usd < 0.01
    ? `$${roundTo(usd, 4).toFixed(4)}`
    : `$${roundTo(usd, 2).toFixed(2)}`;
}

/**
 * Total tokens for one run, e.g. "9,119 tok". Distinct from the run-trace
 * drawer's `formatTokens`, which renders the in→out shape "12k→1.5k".
 */
export function formatTokensTotal(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): string | null {
  if (tokensIn == null && tokensOut == null) return null;
  const total = (tokensIn ?? 0) + (tokensOut ?? 0);
  return `${total.toLocaleString("en-US")} tok`;
}
