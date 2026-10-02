/**
 * Ring ②: `get_blast_radius` use case. Reads only. No HTTP and no status codes here.
 */
import type { Clock } from '../core/clock.ts';
import type { DevDigestApi } from '../core/port.ts';
import type { BlastView } from '../core/views.ts';
import { callsUntil, TIMEOUT_PULLS_MS, TIMEOUT_READ_MS } from './budget.ts';
import { parsePrRef } from './refs.ts';
import { resolvePull } from './resolve.ts';

export interface BlastDeps {
  api: DevDigestApi;
  clock: Clock;
}

export async function getBlastRadius(
  deps: BlastDeps,
  input: { pr: string },
  signal?: AbortSignal,
): Promise<BlastView> {
  const calls = callsUntil(Number.POSITIVE_INFINITY, deps.clock, signal);
  const pr = await resolvePull(deps.api, parsePrRef(input.pr), calls);
  // The server stores a PR's changed files only when its detail is opened; a PR
  // never opened in the browser would otherwise read as "0 changed symbols".
  await deps.api.syncPull(pr.prId, calls(TIMEOUT_PULLS_MS));
  const blast = await deps.api.getBlast(pr.prId, calls(TIMEOUT_READ_MS));
  return { prLabel: pr.label, blast };
}
