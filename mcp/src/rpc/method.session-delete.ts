import { z } from 'zod';
import type { Method, MethodContext } from './method.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';

/**
 * Schema of the parameters of `sessionDelete`.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Identifier of the registered subagent to delete'),
});

/**
 * Stops the subagent `sessionId` with the services of `context` while it is started, and closes its inbox, then deletes
 * it with its messages in the message log. Returns `false` if no such session is registered.
 */
export const deleteSubagent = async (
  sessionId: string,
  { subagents, inboxes, sessions }: MethodContext,
): Promise<boolean> => {
  if (subagents.stop(sessionId)) inboxes.close(sessionId);
  return sessions.delete(sessionId);
};

/**
 * `Method` named `sessionDelete`, which deletes the subagent `sessionId` with its messages in the message log, for
 * good. A subagent that is started is stopped first, and its inbox closed, so the subagent ends. An orchestrator
 * session, or a session that is not registered, fails with invalid parameters.
 */
export const sessionDeleteMethod: Method<typeof PARAMS, void> = {
  name: 'sessionDelete',
  description: 'Deletes a subagent with its messages, for good, and stops it while it runs.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId }, context) => {
    const session = await context.sessions.get(sessionId);
    if (session === undefined) throw new RpcError(RpcErrorCode.INVALID_PARAMS, `No session ${sessionId} is registered`);
    if (session.role !== 'subagent')
      throw new RpcError(RpcErrorCode.INVALID_PARAMS, `Session ${sessionId} is no subagent, so it cannot be deleted`);
    await deleteSubagent(sessionId, context);
  },
};
