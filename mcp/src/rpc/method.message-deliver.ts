import { z } from 'zod';
import type { Inboxes } from '../attachment/inboxes.ts';
import type { Method } from './method.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';

/**
 * Schema of the parameters of `messageDeliver`.
 */
const PARAMS = z.object({
  sessionId: z.string().describe('Identifier of the attached session or subagent to deliver the message to'),
  content: z.string().min(1).describe('Text of the message'),
});

/**
 * `Method` named `messageDeliver`, which puts a message into the inbox of a bound session or of a started subagent,
 * and logs it as a message of the user, since the agent receives it as the output of a command, which is no message
 * of its transcript. A session without an inbox fails with invalid parameters.
 */
export const messageDeliverMethod: Method<typeof PARAMS, void> = {
  name: 'messageDeliver',
  description: 'Puts a message into the inbox of an attached session of the repository, or of a subagent.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId, content }, { inboxes, messageLog }) => {
    deliverServerMessage(inboxes, sessionId, content);
    await messageLog.append({ sessionId, messageId: null, sender: 'user', content, timestamp: Date.now() });
  },
};

/**
 * Puts the message `content` of the atomic-workflow server into the inbox `inboxes` of the session `sessionId`, and
 * logs nothing, since no user wrote it, so the chat of the session does not show it. A session without an inbox fails
 * with invalid parameters.
 */
export const deliverServerMessage = (inboxes: Inboxes, sessionId: string, content: string): void => {
  if (!inboxes.deliver(sessionId, content))
    throw new RpcError(RpcErrorCode.INVALID_PARAMS, `No session ${sessionId} is attached`);
};
