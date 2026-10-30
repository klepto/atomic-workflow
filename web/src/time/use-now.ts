import { useEffect, useReducer } from 'react';
import { systemClock } from '@/lib/clock.system.ts';

/**
 * Time between two renders while the clock ticks, in ms.
 */
const TICK = 1000;

/**
 * Returns the current time of `systemClock` at each render, in ms since the epoch. While `ticking` is true, the
 * component renders again once per second. The time comes from the clock at each render, so a late tick still shows the
 * right time.
 */
export const useNow = (ticking: boolean): number => {
  const [, tick] = useReducer((count: number) => count + 1, 0);
  useEffect(() => (ticking ? systemClock.every(TICK, tick) : undefined), [ticking]);
  return systemClock.now();
};
