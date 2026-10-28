import { z } from 'zod';
import type { Method } from './method.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';

/**
 * Schema of the parameters of `messageLogDelete`.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Identifier of the registered session whose messages to delete'),
});

/**
 * Result of `messageLogDelete`.
 */
interface MessageLogDeleteResult {
  /**
   * Number of the messages that the call deleted.
   */
  readonly deleted: number;
}

/**
 * `Method` named `messageLogDelete`, which deletes every message of the session `sessionId` from the message log, and
 * returns how many it deleted. The session stays registered. A session that is not registered fails with invalid
 * parameters.
 */
export const messageLogDeleteMethod: Method<typeof PARAMS, MessageLogDeleteResult> = {
  name: 'messageLogDelete',
  description: 'Deletes every message of a session from the message log of the repository, for good.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId }, { sessions, messageLog }) => {
    if ((await sessions.get(sessionId)) === undefined)
      throw new RpcError(RpcErrorCode.INVALID_PARAMS, `No session ${sessionId} is registered`);
    return { deleted: await messageLog.deleteSession(sessionId) };
  },
};
