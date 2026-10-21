import { z } from 'zod';
import type { Method } from './method.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';

/**
 * Schema of the parameters of `subagentStop`.
 */
const PARAMS = z.object({
  sessionId: z.string().describe('Session id of the subagent to stop'),
});

/**
 * `Method` named `subagentStop`, which stops a started subagent and closes its inbox. Its wait for messages ends with
 * `stop`, and the subagent ends. A session that is no started subagent fails with invalid parameters.
 */
export const subagentStopMethod: Method<typeof PARAMS, void> = {
  name: 'subagentStop',
  description: 'Stops a subagent that subagentStart started.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId }, { subagents, inboxes }) => {
    if (!subagents.stop(sessionId))
      throw new RpcError(RpcErrorCode.INVALID_PARAMS, `No subagent ${sessionId} is started`);
    inboxes.close(sessionId);
  },
};
