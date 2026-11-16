import { startTransition, useEffect, useState } from 'react';

/**
 * Number of items that mount at first, and that each later step adds.
 */
const STEP = 20;

/**
 * Count of the mounted items of one list, which a new key starts again.
 */
interface CountState {
  /**
   * Key of the list.
   */
  readonly key: string;

  /**
   * Number of the mounted items of the list.
   */
  readonly count: number;
}

/**
 * Returns the next count after `count` for a list of `total` items: `step` more, at most `total`.
 */
export const nextCount = (count: number, total: number, step: number): number => Math.min(total, count + step);

/**
 * Returns how many of the `total` items of the list `key` mount now. The first `STEP` items mount at first, and each
 * commit then mounts `STEP` more in a transition, until all of them mount, so that no single commit and its layout
 * mount a long list at once. A new `key` starts again from `STEP`.
 */
export const useGrowingCount = (key: string, total: number): number => {
  const [state, setState] = useState<CountState>({ key, count: STEP });
  const count = Math.min(total, state.key === key ? state.count : STEP);

  useEffect(() => {
    if (count >= total) return undefined;
    // A timer, so that each step commits in a task of its own, after the browser painted the step before.
    const timer = setTimeout(() => startTransition(() => setState({ key, count: nextCount(count, total, STEP) })), 0);
    return () => clearTimeout(timer);
  }, [key, count, total]);

  return count;
};
