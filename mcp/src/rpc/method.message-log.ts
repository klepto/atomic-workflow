import { z } from 'zod';
import { type LoggedMessage, MESSAGE_SENDERS } from '../storage/message-log-store.ts';
import type { Method } from './method.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';

/**
 * Schema of the parameters of `messageLog`.
 */
const PARAMS = z.object({
  sessionId: z.string().describe('Identifier of the registered session that the message belongs to'),
  messageId: z.string().optional().describe('Identifier that the agent gives the message, unique in its session'),
  sender: z.enum(MESSAGE_SENDERS).describe('Who wrote the message: user or agent'),
  content: z.string().describe('Text of the message'),
  timestamp: z.number().int().nonnegative().optional().describe('Time of the message in ms since the epoch'),
});

/**
 * `Method` named `messageLog`, which adds a message of a registered session to the message log and returns it as
 * logged. A message without a time gets the time of the call. A message with the message id of a logged message
 * is not added again. A message of a session that is not registered fails with invalid parameters.
 */
export const messageLogMethod: Method<typeof PARAMS, LoggedMessage> = {
  name: 'messageLog',
  description: 'Adds a message to the message log of the repository, and returns it with its identifier.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId, messageId, sender, content, timestamp = Date.now() }, { sessions, messageLog }) => {
    if ((await sessions.get(sessionId)) === undefined)
      throw new RpcError(RpcErrorCode.INVALID_PARAMS, `No session ${sessionId} is registered`);
    return messageLog.append({ sessionId, messageId: messageId ?? null, sender, content, timestamp });
  },
};
