/**
 * Ring ③: the real `Clock` (wall time and timers). Tests inject a fake instead.
 * No MCP SDK and no HTTP here.
 */
import type { Clock } from '../core/clock.ts';

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      const done = (): void => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      signal?.addEventListener('abort', done, { once: true });
    }),
};
