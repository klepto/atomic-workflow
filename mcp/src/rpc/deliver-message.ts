import type { Inboxes } from '../attachment/inboxes.ts';
import type { MethodContext } from './method.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

/**
 * Puts the message `content` of the user into the inbox of the session `sessionId`, with the services of `context`,
 * and logs it as a message of the user now, since the agent receives it as the output of a command, which is no
 * message of its transcript. A session without an inbox fails with invalid parameters. Rejects as the message log of
 * `context` does.
 */
export const deliverUserMessage = async (sessionId: string, content: string, context: MethodContext): Promise<void> => {
  deliverServerMessage(sessionId, content, context.inboxes);
  const timestamp = context.clock.now();
  await context.messageLog.append({ sessionId, messageId: null, sender: 'user', content, timestamp });
};

/**
 * Puts the message `content` of the atomic-workflow server into the inbox of the session `sessionId` in `inboxes`, and
 * logs nothing, since no user wrote it, so the chat of the session does not show it. A session without an inbox fails
 * with invalid parameters.
 */
export const deliverServerMessage = (sessionId: string, content: string, inboxes: Inboxes): void => {
  if (!inboxes.deliver(sessionId, content))
    throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, `No session ${sessionId} is attached`);
};
