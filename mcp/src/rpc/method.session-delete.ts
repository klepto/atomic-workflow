import { z } from 'zod';
import { deleteSubagent } from './delete-subagent.ts';
import type { Method } from './method.ts';
import { registeredSession } from './registered-session.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

/**
 * Schema of the parameters of `sessionDelete`.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Identifier of the registered subagent to delete'),
});

/**
 * `Method` named `sessionDelete`, which deletes the subagent `sessionId` with its messages in the message log, for
 * good, as `deleteSubagent` does. A subagent that is started is stopped first, at once, as `subagentStop` stops it. An
 * orchestrator session, or a session that is not registered, fails with invalid parameters.
 */
export const sessionDeleteMethod: Method<typeof PARAMS, void> = {
  name: 'sessionDelete',
  description: 'Deletes a subagent with its messages, for good, and stops it while it runs.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId }, context) => {
    const session = await registeredSession(sessionId, context.sessions);
    if (session.role !== 'subagent')
      throw new RpcError(
        RPC_ERROR_CODES.INVALID_PARAMS,
        `Session ${sessionId} is no subagent, so it cannot be deleted`,
      );
    await deleteSubagent(sessionId, context);
  },
};
