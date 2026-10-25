import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ChangeEvent } from './types.ts';

/**
 * Every change event that a stream sends, as a record so that the compiler sees a missing one.
 */
const CHANGE_EVENTS: Record<ChangeEvent, true> = {
  sessions: true,
  messages: true,
  tasks: true,
};

/**
 * The milliseconds to wait before a stream that closed for good is opened again.
 */
const RETRY_DELAY = 3000;

/**
 * Whether the stream of the open page is connected.
 */
let online = true;

/**
 * The functions to call when the connection changes.
 */
const listeners = new Set<() => void>();

/**
 * Sets the connection to `value` and tells every listener of a change.
 */
const setOnline = (value: boolean) => {
  if (online === value) {
    return;
  }
  online = value;
  for (const listener of listeners) {
    listener();
  }
};

/**
 * Calls `listener` whenever the connection changes. Returns the function that stops the calls.
 */
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Returns whether the stream of the open page is connected.
 */
const readOnline = () => online;

/**
 * Returns the state of the connection to the server, fed by the stream of the open page.
 * While `online` is false, a control that sends says so, and its messages wait until the server is back.
 */
export const useConnection = () => ({ online: useSyncExternalStore(subscribe, readOnline) });

/**
 * Opens a stream on `path` that calls `onEvent` for each change event, and `onReconnect` when it opens again
 * after a drop. A stream that closed for good is opened again after `RETRY_DELAY`.
 * Returns the function that closes the stream.
 */
const openStream = (path: string, onEvent: (event: ChangeEvent) => void, onReconnect: () => void) => {
  let source: EventSource;
  let dropped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  /**
   * Marks the connection as up, and calls `onReconnect` when the stream opens after a drop.
   */
  const handleOpen = () => {
    setOnline(true);
    if (dropped) {
      dropped = false;
      onReconnect();
    }
  };

  /**
   * Marks the connection as down. A stream that closed for good is opened again later.
   */
  const handleError = () => {
    dropped = true;
    setOnline(false);
    if (source.readyState === EventSource.CLOSED) {
      source.close();
      retry = setTimeout(connect, RETRY_DELAY);
    }
  };

  /**
   * Passes the name of the change event `event` to `onEvent`.
   */
  const handleChange = (event: Event) => onEvent(event.type as ChangeEvent);

  /**
   * Opens a new stream on `path` and listens to it.
   */
  const connect = () => {
    source = new EventSource(path);
    source.addEventListener('open', handleOpen);
    source.addEventListener('error', handleError);
    for (const name of Object.keys(CHANGE_EVENTS)) {
      source.addEventListener(name, handleChange);
    }
  };

  connect();
  return () => {
    clearTimeout(retry);
    source.close();
    setOnline(true);
  };
};

/**
 * Opens one stream on `path`, such as `/events`, while the calling page is open. Calls `onEvent` with the name of each
 * change event, and `onReconnect` once each time the stream opens again after a drop, so that the page reads
 * everything again.
 */
export const useEventStream = (path: string, onEvent: (event: ChangeEvent) => void, onReconnect: () => void): void => {
  const onEventRef = useRef(onEvent);
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => {
    onEventRef.current = onEvent;
    onReconnectRef.current = onReconnect;
  });
  useEffect(
    () =>
      openStream(
        path,
        (event) => onEventRef.current(event),
        () => onReconnectRef.current(),
      ),
    [path],
  );
};
