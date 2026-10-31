import { z } from 'zod';
import type { Method, MethodContext } from './method.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';
import { stopSubagent } from './stop-subagent.ts';
import { attachedSubagent } from './subagent-queries.ts';

/**
 * Schema of the parameters of `subagentFinish`.
 */
const PARAMS = z.object({
  sessionId: z.string().describe('Session id of the subagent that calls the tool, from its prompt'),
});

/**
 * `Method` named `subagentFinish`, which a subagent calls once the skill of its first message has ended, so that it
 * ends too. It stops the subagent `sessionId` and closes its inbox, as `stopSubagent` does, so that its wait for
 * messages ends with `stop`, and fails as it does. A session that is no started subagent of the session of the caller
 * fails with invalid parameters.
 */
export const subagentFinishMethod: Method<typeof PARAMS, void> = {
  name: 'subagentFinish',
  description:
    'Ends this subagent once the skill of its first message has ended. Call it with the session id of your prompt, after your last reply, then end your turn.',
  agent: true,
  params: PARAMS,
  handle: async ({ sessionId }, context) => {
    if (!isSubagentOfCaller(sessionId, context) || !(await stopSubagent(sessionId, context)))
      throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, `No subagent ${sessionId} of this session is started`);
  },
};

/**
 * Returns whether `sessionId` is an attached subagent of the session that the connection of the caller serves, with
 * the services of `context`, so that an agent ends only a subagent of its own session.
 */
const isSubagentOfCaller = (sessionId: string, context: MethodContext): boolean => {
  const subagent = attachedSubagent(sessionId, context.subagents);
  return (
    subagent !== undefined &&
    context.caller !== undefined &&
    context.sessionConnections.get(subagent.parentId) === context.caller
  );
};
