/**
 * Source of the current time. A module that reads the time receives a clock, so that a test can fix the time.
 */
export interface Clock {
  /**
   * Returns the current time, in ms since the epoch.
   */
  now(): number;
}
