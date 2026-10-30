import type { TimeoutSignalFunction } from './timeout-signal.ts';

/**
 * `TimeoutSignalFunction` that aborts the signal with a timer of Node.js.
 */
export const timersTimeoutSignal: TimeoutSignalFunction = (delay) => AbortSignal.timeout(delay);
