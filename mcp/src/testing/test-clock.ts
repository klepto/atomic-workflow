import type { Clock } from '../clock/clock.ts';

/**
 * `Clock` of a test, whose time moves only when the test moves it.
 */
export interface TestClock extends Clock {
  /**
   * Moves the time forward by `span` ms.
   */
  advance(span: number): void;

  /**
   * Sets the time to `time`, in ms since the epoch.
   */
  set(time: number): void;
}

/**
 * Returns a `TestClock` whose time starts at `start`, in ms since the epoch, 0 by default.
 */
export const testClock = (start = 0): TestClock => {
  let time = start;
  return {
    now: () => time,
    advance: (span) => {
      time += span;
    },
    set: (next) => {
      time = next;
    },
  };
};
