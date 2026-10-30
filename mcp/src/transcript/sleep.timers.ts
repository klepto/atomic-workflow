import { setTimeout as delay } from 'node:timers/promises';
import type { SleepFunction } from './sleep.ts';

/**
 * `SleepFunction` that waits with a timer of Node.js. Resolves after `duration` ms, or as soon as `signal` aborts.
 */
export const timersSleep: SleepFunction = async (duration, signal) => {
  // The only failure of the timer is the abort, which the caller reads from `signal`.
  await delay(duration, undefined, { signal }).catch(() => undefined);
};
