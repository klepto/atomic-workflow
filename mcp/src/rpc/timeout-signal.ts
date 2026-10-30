/**
 * Function that returns a signal that aborts once `delay` ms have passed.
 */
export type TimeoutSignalFunction = (delay: number) => AbortSignal;
