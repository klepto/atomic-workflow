import type { ChangeEvent } from '@/api/types.ts';

/**
 * Functions that a stream of change events calls.
 */
export interface StreamListener {
  /**
   * Receives the name of each change event that the stream sends.
   */
  onEvent(event: ChangeEvent): void;

  /**
   * Runs once each time the stream opens again after a drop, since events may have been lost meanwhile.
   */
  onReconnect(): void;

  /**
   * Receives whether the stream is connected: `false` on each drop, and `true` on each open.
   */
  onOnline(online: boolean): void;
}

/**
 * Function that opens a stream of change events on the path `path`, such as `/events`, which calls `listener`, and
 * opens itself again after a drop. Returns the function that closes the stream for good.
 */
export type OpenStreamFunction = (path: string, listener: StreamListener) => () => void;
