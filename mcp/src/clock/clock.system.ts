import type { Clock } from './clock.ts';

/**
 * `Clock` that reads the time of the system with `Date.now()`.
 */
export const systemClock: Clock = {
  now: () => Date.now(),
};
