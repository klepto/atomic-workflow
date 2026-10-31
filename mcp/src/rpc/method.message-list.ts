import { z } from 'zod';
import type { LoggedMessage } from '../storage/message-log-store.ts';
import type { Method } from './method.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

/**
 * Schema of the parameters of `messageList`.
 */
const PARAMS = z.object({
  sessionId: z.string().optional().describe('Identifier of the session whose messages to return, all when left out'),
  alias: z
    .string()
    .min(1)
    .optional()
    .describe('Alias of the sessions whose messages to return, all when left out. Not together with sessionId'),
  after: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Identifier after which the list starts, 0 for the start, the latest messages when left out'),
  limit: z.number().int().min(1).max(1_000).default(100).describe('Greatest number of messages to return'),
});

/**
 * `Method` named `messageList`, which returns the messages of the message log after an identifier, or the latest
 * messages without one, in the order of the log. With a session, returns only the messages of that session, and with
 * an alias, only the messages of the sessions that hold that alias. A call with both a session and an alias fails
 * with invalid parameters.
 */
export const messageListMethod: Method<typeof PARAMS, { readonly messages: readonly LoggedMessage[] }> = {
  name: 'messageList',
  description: 'Returns the messages of the message log of the repository after an identifier, or the latest ones.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId, alias, after, limit }, { messageLog }) => {
    if (sessionId !== undefined && alias !== undefined)
      throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, 'A list of messages takes a session or an alias, not both');
    return { messages: await messageLog.list({ sessionId, alias, after, limit }) };
  },
};
