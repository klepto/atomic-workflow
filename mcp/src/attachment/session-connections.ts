import type { RpcConnection } from '../rpc/rpc-connection.ts';
import { mapCreateSessionConnections } from './session-connections.map.ts';

/**
 * Connections of the attached session servers, by the session that each one serves now.
 */
export interface SessionConnections {
  /**
   * Binds the session `sessionId` to `connection`, until the connection closes or binds another session. A session
   * that another connection serves already moves to `connection`.
   */
  bind(sessionId: string, connection: RpcConnection): void;

  /**
   * Returns the connection that serves the session `sessionId`. If no connection serves it, returns `undefined`
   * instead.
   */
  get(sessionId: string): RpcConnection | undefined;

  /**
   * Returns the ids of the bound sessions, in the order in which they were bound, the latest last.
   */
  list(): readonly string[];
}

/**
 * Function that returns new connections of session servers, with no session bound.
 */
export type CreateSessionConnectionsFunction = () => SessionConnections;

/**
 * Default `CreateSessionConnectionsFunction`, which keeps the connections in memory.
 */
export const CreateSessionConnections: CreateSessionConnectionsFunction = mapCreateSessionConnections;
