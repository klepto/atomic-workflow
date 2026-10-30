/**
 * Returns a function that runs `read`, with reads that never overlap. A call during a read queues one more read, which
 * starts once that read ends, however many calls came meanwhile. The function resolves once a read that started after
 * its call ended. `read` must not reject.
 */
export const serialReads = (read: () => Promise<void>): (() => Promise<void>) => {
  let running: Promise<void> | undefined;
  let queued: Promise<void> | undefined;

  /**
   * Starts a read, and notes it as the running one until it ends.
   */
  const start = (): Promise<void> => {
    running = read().finally(() => {
      running = undefined;
    });
    return running;
  };

  return () => {
    if (queued !== undefined) return queued;
    if (running === undefined) return start();
    queued = running.then(() => {
      queued = undefined;
      return start();
    });
    return queued;
  };
};
