import { z } from 'zod';
import type { Method } from './method.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';

/**
 * Schema of the parameters of `stopSubagent`.
 */
const PARAMS = z.object({
  sessionId: z.string().describe('Session id of the subagent to stop'),
});

/**
 * `Method` named `stopSubagent`, which stops a started subagent. The subagent gets a `stop` command the next time that
 * it waits for one, and ends. A session that is no started subagent fails with invalid parameters.
 */
export const stopSubagentMethod: Method<typeof PARAMS, void> = {
  name: 'stopSubagent',
  description: 'Stops a subagent that startSubagent started.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId }, { subagents }) => {
    if (!subagents.stop(sessionId))
      throw new RpcError(RpcErrorCode.INVALID_PARAMS, `No subagent ${sessionId} is started`);
  },
};
