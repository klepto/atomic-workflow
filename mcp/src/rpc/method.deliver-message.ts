import { z } from 'zod';
import type { Method } from './method.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';
import { deliverMethod } from './session-method.deliver.ts';

/**
 * Schema of the parameters of `deliverMessage`.
 */
const PARAMS = z.object({
  sessionId: z.string().describe('Identifier of the attached session or subagent to deliver the message to'),
  content: z.string().min(1).describe('Text of the message'),
});

/**
 * `Method` named `deliverMessage`, which puts a message into the chat of a session whose session server is attached,
 * and resolves once the session server has sent it to the agent. A message to a started subagent goes into its inbox
 * instead, and is logged as a message of the user, since the subagent receives it as the result of a tool. A session
 * that is neither served nor a started subagent fails with invalid parameters.
 */
export const deliverMessageMethod: Method<typeof PARAMS, void> = {
  name: 'deliverMessage',
  description: 'Puts a message into the chat of an attached session of the repository, or of a subagent.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId, content }, { sessionConnections, subagents, messageLog }) => {
    if (subagents.deliver(sessionId, content)) {
      await messageLog.append({ sessionId, messageId: null, sender: 'user', content, timestamp: Date.now() });
      return;
    }
    const connection = sessionConnections.get(sessionId);
    if (connection === undefined)
      throw new RpcError(RpcErrorCode.INVALID_PARAMS, `No session ${sessionId} is attached`);
    const params: z.input<typeof deliverMethod.params> = { content };
    await connection.request(deliverMethod.name, params);
  },
};
