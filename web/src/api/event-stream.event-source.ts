import type { OpenStreamFunction } from '@/api/event-stream.ts';
import type { ChangeEvent } from '@/api/types.ts';
import { systemClock } from '@/lib/clock.system.ts';

/**
 * Every change event that a stream sends, as a record so that the compiler sees a missing one.
 */
const CHANGE_EVENTS: Readonly<Record<ChangeEvent, true>> = {
  sessions: true,
  messages: true,
  tasks: true,
};

/**
 * Time to wait before a stream that closed for good is opened again, in ms.
 */
const RETRY_DELAY = 3000;

/**
 * `OpenStreamFunction` over an `EventSource` of the browser. The browser opens a dropped stream again by itself; a
 * stream that the browser closed for good is opened again after `RETRY_DELAY`.
 */
export const eventSourceOpenStream: OpenStreamFunction = (path, listener) => {
  let source: EventSource;
  let dropped = false;
  let cancelRetry: (() => void) | undefined;

  /**
   * Reports the stream as connected, and calls `onReconnect` when the stream opens after a drop.
   */
  const handleOpen = (): void => {
    listener.onOnline(true);
    if (dropped) {
      dropped = false;
      listener.onReconnect();
    }
  };

  /**
   * Reports the stream as dropped. A stream that closed for good is opened again later.
   */
  const handleError = (): void => {
    dropped = true;
    listener.onOnline(false);
    if (source.readyState === EventSource.CLOSED) {
      source.close();
      cancelRetry = systemClock.after(RETRY_DELAY, connect);
    }
  };

  /**
   * Passes the name of the change event `event` to `onEvent`.
   */
  const handleChange = (event: Event): void => listener.onEvent(event.type as ChangeEvent);

  /**
   * Opens a new stream on `path` and listens to it.
   */
  const connect = (): void => {
    source = new EventSource(path);
    source.addEventListener('open', handleOpen);
    source.addEventListener('error', handleError);
    for (const name of Object.keys(CHANGE_EVENTS)) {
      source.addEventListener(name, handleChange);
    }
  };

  connect();
  return () => {
    cancelRetry?.();
    source.close();
  };
};
