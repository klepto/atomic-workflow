import { useSyncExternalStore } from 'react';
import { isOnline, subscribeConnection } from '@/api/connection.ts';

/**
 * State of the connection to the server.
 */
interface Connection {
  /**
   * Whether the stream of the open page is connected. While it is `false`, a control that sends says so, and its
   * messages wait until the server is back.
   */
  readonly online: boolean;
}

/**
 * Returns the state of the connection to the server, which the stream of the open page feeds, and renders again when it
 * changes.
 */
export const useConnection = (): Connection => ({ online: useSyncExternalStore(subscribeConnection, isOnline) });
