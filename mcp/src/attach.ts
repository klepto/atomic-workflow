import { socketAttach } from './attach.socket.ts';

/**
 * Live connection of a session server to the repository server.
 */
export interface Attachment {
  /**
   * Whether the attach launched a repository server, rather than finding one running. When two session servers
   * attach at the same time, both can launch one, and only one of the two serves.
   */
  readonly launched: boolean;

  /**
   * Promise that resolves when the connection closes, such as when the repository server ends.
   */
  readonly closed: Promise<void>;
}

/**
 * Function that connects to the repository server at `address` and returns the connection. When no repository server
 * runs at `address`, calls `launch` to start one first, and connects to it once it is up.
 * If the repository server does not come up, rejects.
 */
export type AttachFunction = (address: string, launch: () => Promise<void>) => Promise<Attachment>;

/**
 * Default `AttachFunction`, which connects through a named pipe or a Unix domain socket.
 */
export const Attach: AttachFunction = socketAttach;
