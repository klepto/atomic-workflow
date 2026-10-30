import type { RpcHandler } from '../rpc/message.ts';
import type { OpenRpcConnectionFunction, RpcConnection } from '../rpc/rpc-connection.ts';
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
   * Starts a repository server, and resolves once it has started. Without it, an attach that finds no repository
   * server running starts none, and fails.
   */
  launch?(): Promise<void>;

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
 * the repository server has answered `hello`. When no repository server runs at `address`, or the one that answers
 * refuses a session server since it is closing, calls `launch` of `dependencies` to start one first, and connects to
 * it once it is up.
 * If no repository server runs at `address` and `dependencies` has no `launch`, rejects with a
 * `NoRepositoryServerError`. If `launch` rejects, rejects with its error. If the launched repository server does not
 * come up, or the repository server does not answer `hello` in time with a valid result, rejects.
 */
export type AttachFunction = (address: string, role: Role, dependencies: AttachDependencies) => Promise<Attachment>;

/**
 * Failure of an attach that found no repository server running, and had no `launch` to start one. Its `cause` is the
 * error of the try to connect.
 */
export class NoRepositoryServerError extends Error {
  /**
   * Address at which no repository server runs.
   */
  readonly address: string;

  /**
   * Creates the failure for the address `address`, with the error of the try to connect as `cause` of `options`.
   */
  constructor(address: string, options?: ErrorOptions) {
    super(`No atomic-workflow server runs at ${address}`, options);
    this.name = 'NoRepositoryServerError';
    this.address = address;
  }
}
