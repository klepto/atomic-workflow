/**
 * Function that resolves after `duration` ms, or as soon as `signal` aborts. It never rejects, so a loop that sleeps
 * between two polls reads the abort from `signal`.
 */
export type SleepFunction = (duration: number, signal: AbortSignal) => Promise<void>;
