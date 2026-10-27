import { z } from 'zod';
import type { Method } from './method.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';

/**
 * Schema of the parameters of `sessionTaskSet`.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Identifier of the registered session'),
  taskId: z.number().int().positive().describe('Identifier of the task that the session works on'),
});

/**
 * `Method` named `sessionTaskSet`, which sets the task that a subagent works on to `taskId`, such as once the subagent
 * has created the task. A subagent that works on a task already keeps it, and an orchestrator session works on no
 * task, since it serves every task. A session that is not registered fails with invalid parameters.
 */
export const sessionTaskSetMethod: Method<typeof PARAMS, void> = {
  name: 'sessionTaskSet',
  description: 'Sets the task that a subagent works on, unless it works on a task already.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId, taskId }, { sessions }) => {
    const session = await sessions.get(sessionId);
    if (session === undefined) throw new RpcError(RpcErrorCode.INVALID_PARAMS, `No session ${sessionId} is registered`);
    if (session.role === 'subagent') await sessions.setTask(sessionId, taskId);
  },
};
