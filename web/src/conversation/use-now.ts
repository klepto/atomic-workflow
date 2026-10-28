import { useEffect, useReducer } from 'react';

/**
 * The time in milliseconds between two renders while the clock ticks.
 */
const TICK = 1000;

/**
 * Returns the time of the clock, `Date.now()`, at each render. While `ticking` is true, the component renders again
 * once per second. The time comes from the clock at each render, so a late tick still shows the right time.
 */
export const useNow = (ticking: boolean): number => {
  const [, tick] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    if (!ticking) {
      return;
    }
    const interval = setInterval(tick, TICK);
    return () => clearInterval(interval);
  }, [ticking]);
  return Date.now();
};
