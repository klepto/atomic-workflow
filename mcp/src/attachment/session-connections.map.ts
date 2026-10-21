import type { RpcConnection } from '../rpc/rpc-connection.ts';
import type { CreateSessionConnectionsFunction } from './session-connections.ts';

/**
 * `CreateSessionConnectionsFunction` that keeps the connections in a map, by session, in the order of binding.
 */
export const mapCreateSessionConnections: CreateSessionConnectionsFunction = () => {
  const connections = new Map<string, RpcConnection>();
  return {
    bind: (sessionId, connection) => bind(connections, sessionId, connection),
    get: (sessionId) => connections.get(sessionId),
    list: () => [...connections.keys()],
  };
};

/**
 * Binds the session `sessionId` to `connection` in `connections`, in place of the session that `connection` served
 * before, and returns that session. The binding goes away when the connection closes, unless another connection has
 * taken the session by then. If `connection` served no session, returns `undefined` instead.
 */
const bind = (
  connections: Map<string, RpcConnection>,
  sessionId: string,
  connection: RpcConnection,
): string | undefined => {
  const previous = [...connections].find(([, bound]) => bound === connection)?.[0];
  if (previous !== undefined) connections.delete(previous);
  // A map keeps the place of a key that it sets again, so the session moves to the end only once it is deleted.
  connections.delete(sessionId);
  connections.set(sessionId, connection);
  void connection.closed.then(() => {
    if (connections.get(sessionId) === connection) connections.delete(sessionId);
  });
  return previous;
};
