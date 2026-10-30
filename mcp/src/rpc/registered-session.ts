import type { RegisteredSession, SessionStore } from '../storage/session-store.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

/**
 * Returns the session `sessionId` of `sessions`. A session that is not registered fails with invalid parameters.
 * Rejects as `sessions` does.
 */
export const registeredSession = async (sessionId: string, sessions: SessionStore): Promise<RegisteredSession> => {
  const session = await sessions.get(sessionId);
  if (session === undefined)
    throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, `No session ${sessionId} is registered`);
  return session;
};
