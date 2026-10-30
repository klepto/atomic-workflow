import type { Clock } from '@/lib/clock.ts';

/**
 * `Clock` that reads the time of the system with `Date.now()`, and runs its timers with `setTimeout` and
 * `setInterval`.
 */
export const systemClock: Clock = {
  now: () => Date.now(),
  after: (delay, run) => {
    const timeout = setTimeout(run, delay);
    return () => clearTimeout(timeout);
  },
  every: (interval, tick) => {
    const timer = setInterval(tick, interval);
    return () => clearInterval(timer);
  },
};
