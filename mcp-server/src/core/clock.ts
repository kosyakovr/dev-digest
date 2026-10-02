/**
 * Ring ①: the clock port. Time is outside the process's control, so use cases
 * receive it injected (a fake in tests, `src/adapters/clock.ts` in production).
 * No imports.
 */
export interface Clock {
  now(): number;
  /** Resolves after `ms`, or early when `signal` aborts (callers then check the signal). */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}
