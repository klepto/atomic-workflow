import { z } from 'zod';
import type { Method } from './method.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';
import { stopSubagent } from './stop-subagent.ts';

/**
 * Schema of the parameters of `subagentStop`.
 */
const PARAMS = z.object({
  sessionId: z.string().describe('Session id of the subagent to stop'),
});

/**
 * `Method` named `subagentStop`, which stops a started subagent at once, even in the middle of a turn, and closes its
 * inbox, as `stopSubagent` does, and fails as it does. A session that is no started subagent fails with invalid
 * parameters.
 */
export const subagentStopMethod: Method<typeof PARAMS, void> = {
  name: 'subagentStop',
  description: 'Stops a subagent that subagentStart started.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId }, context) => {
    if (!(await stopSubagent(sessionId, context)))
      throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, `No subagent ${sessionId} is started`);
  },
};
