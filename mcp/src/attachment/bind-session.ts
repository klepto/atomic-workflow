import { z } from 'zod';
import type { Method } from '../rpc/method.ts';
import type { RpcConnection } from '../rpc/rpc-connection.ts';
import { RPC_ERROR_CODES, RpcError } from '../rpc/rpc-error.ts';

/**
 * Name of the method that a session server calls each time the agent of its session moves on to a session, so that
 * the repository server reaches that session over the connection.
 */
export const BIND_SESSION_METHOD = 'bindSession';

/**
 * Schema of the parameters of `bindSession`.
 */
export const BIND_SESSION_PARAMS = z.object({
  sessionId: z.string().min(1),
});

/**
 * Parameters of `bindSession`.
 */
export type BindSessionParams = z.output<typeof BIND_SESSION_PARAMS>;

/**
 * Returns the method `bindSession` of one connection, which binds a session to the connection that
 * `sessionConnection` returns, and gives the session an inbox until the connection closes. The inbox of the session
 * that the connection served before moves to the new session, so a wait for its messages that is under way, such as
 * one from before `/clear`, receives the messages of the new session. Before the client says hello in the role
 * `session`, `sessionConnection` returns `undefined`, and the method fails with `INVALID_REQUEST`.
 */
export const bindSessionMethod = (
  sessionConnection: () => RpcConnection | undefined,
): Method<typeof BIND_SESSION_PARAMS, void> => ({
  name: BIND_SESSION_METHOD,
  description: 'Binds a session to the connection, so that the repository server reaches the session over it.',
  agent: false,
  params: BIND_SESSION_PARAMS,
  handle: async ({ sessionId }, { sessionConnections, inboxes }) => {
    const connection = sessionConnection();
    if (connection === undefined) {
      throw new RpcError(RPC_ERROR_CODES.INVALID_REQUEST, 'Only a session server can bind a session');
    }
    const previous = sessionConnections.bind(sessionId, connection);
    if (previous !== undefined) inboxes.move(previous, sessionId);
    inboxes.open(sessionId, connection.closed);
  },
});
