import { useEffect, useRef } from 'react';
import { eventSourceOpenStream } from '@/api/event-stream.event-source.ts';
import type { StreamListener } from '@/api/event-stream.ts';

/**
 * Opens one stream of change events on `path`, such as `/events`, while the calling component is mounted, and passes
 * what the stream reports to the functions of `listener` of the latest render. Once the stream closes, it reports the
 * stream as connected, so that no control waits for a stream that the page no longer has.
 */
export const useEventStream = (path: string, listener: StreamListener): void => {
  const listenerRef = useRef(listener);
  useEffect(() => {
    listenerRef.current = listener;
  });
  useEffect(() => {
    const close = eventSourceOpenStream(path, {
      onEvent: (event) => listenerRef.current.onEvent(event),
      onReconnect: () => listenerRef.current.onReconnect(),
      onOnline: (online) => listenerRef.current.onOnline(online),
    });
    return () => {
      close();
      listenerRef.current.onOnline(true);
    };
  }, [path]);
};
