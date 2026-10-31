import { startTransition, useEffect, useState } from 'react';

/**
 * Returns how many of `target` items to render now: `step` at first, then `step` more after each render, until
 * `target`. Each step renders as a transition, so that the page keeps taking input between two steps, and input
 * interrupts a step. A `target` below the current count lowers it at once.
 */
export const useProgressiveLimit = (target: number, step: number): number => {
  const [limit, setLimit] = useState(() => Math.min(target, step));
  const shown = Math.min(limit, target);

  useEffect(() => {
    if (shown >= target) return;
    startTransition(() => setLimit((current) => Math.min(target, current + step)));
  }, [shown, target, step]);

  return shown;
};
