import type { RpcHandler } from '../rpc/message.ts';
import type { OpenRpcConnectionFunction, RpcConnection } from '../rpc/rpc-connection.ts';
import { socketAttach } from './attach.socket.ts';
import type { Role } from './hello.ts';

/**
 * Live connection of a client to the repository server.
 */
export interface Attachment {
  /**
   * Whether the attach launched a repository server, rather than finding one running. When two session servers
   * attach at the same time, both can launch one, and only one of the two serves.
   */
  readonly launched: boolean;

  /**
   * URL of the web server of the repository server.
   */
  readonly url: string;

  /**
   * JSON-RPC 2.0 connection to the repository server, which has said hello already.
   */
  readonly connection: RpcConnection;
}

/**
 * Dependencies of an attach.
 */
export interface AttachDependencies {
  /**
   * Starts a repository server, and resolves once it has started.
   */
  launch(): Promise<void>;

  /**
   * Function that opens the JSON-RPC 2.0 connection.
   */
  readonly openConnection: OpenRpcConnectionFunction;

  /**
   * Function that answers the requests of the repository server.
   */
  readonly handle: RpcHandler;
}

/**
 * Function that connects to the repository server at `address` in the role `role`, and returns the connection once
 * the repository server has answered `hello`. When no repository server runs at `address`, calls `launch` of
 * `dependencies` to start one first, and connects to it once it is up.
 * If the repository server does not come up, or does not answer `hello` with a valid result, rejects.
 */
export type AttachFunction = (address: string, role: Role, dependencies: AttachDependencies) => Promise<Attachment>;

/**
 * Default `AttachFunction`, which connects through a named pipe or a Unix domain socket.
 */
export const Attach: AttachFunction = socketAttach;
