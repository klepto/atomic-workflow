/**
 * Source of the current time and of the timers that drive data, such as a retry or a tick, so that a test can fix the
 * time and run the timers at will.
 */
export interface Clock {
  /**
   * Returns the current time, in ms since the epoch.
   */
  now(): number;

  /**
   * Calls `run` once after `delay` ms. Returns the function that cancels the call.
   */
  after(delay: number, run: () => void): () => void;

  /**
   * Calls `tick` every `interval` ms. Returns the function that stops the calls.
   */
  every(interval: number, tick: () => void): () => void;
}
