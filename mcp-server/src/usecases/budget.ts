/**
 * Ring ②: the time budget of `run_agent_on_pr`, and deadline-aware call options.
 *
 * Claude Code auto-backgrounds an MCP tool call after 120 000 ms
 * (CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS). The call must therefore return before
 * that: `T0` is handler entry, the wait for the run ends at `T0 + 102 000` and the
 * final confirmation reads end at `T0 + 110 000`, leaving about 9.9 s of margin.
 * Time only comes from the injected `Clock`.
 */
import type { Clock } from '../core/clock.ts';
import type { CallOpts } from '../core/port.ts';

export const TOTAL_BUDGET_MS = 110_000;
export const CONFIRM_RESERVE_MS = 8_000;
/** Offset from T0 at which waiting for the run stops. */
export const WAIT_WINDOW_MS = TOTAL_BUDGET_MS - CONFIRM_RESERVE_MS;
export const POLL_INTERVAL_MS = 3_000;

export const TIMEOUT_REPOS_MS = 5_000;
export const TIMEOUT_AGENTS_MS = 5_000;
export const TIMEOUT_PULLS_MS = 15_000;
export const TIMEOUT_ACTIVE_MS = 5_000;
export const TIMEOUT_START_MS = 10_000;
export const TIMEOUT_POLL_MS = 5_000;
export const TIMEOUT_CONFIRM_MS = 8_000;
export const TIMEOUT_READ_MS = 8_000;

/** Never below 1 ms: an expired deadline yields an immediate timeout, not an unbounded call. */
export function clip(timeoutMs: number, deadline: number, now: number): number {
  return Math.max(1, Math.min(timeoutMs, deadline - now));
}

export type Calls = (timeoutMs: number) => CallOpts;

/** Call options whose timeout is clipped to `deadline` (use `Infinity` for none). */
export function callsUntil(deadline: number, clock: Clock, signal?: AbortSignal): Calls {
  return (timeoutMs) => {
    const opts: CallOpts = { timeoutMs: clip(timeoutMs, deadline, clock.now()) };
    if (signal) opts.signal = signal;
    return opts;
  };
}
