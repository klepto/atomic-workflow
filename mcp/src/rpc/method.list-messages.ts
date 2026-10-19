import { z } from 'zod';
import type { LoggedMessage } from '../storage/message-log-store.ts';
import type { Method } from './method.ts';

/**
 * Schema of the parameters of `listMessages`.
 */
const PARAMS = z.object({
  sessionId: z.string().optional().describe('Identifier of the session whose messages to return, all when left out'),
  after: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Identifier after which the list starts, 0 for the start, the latest messages when left out'),
  limit: z.number().int().min(1).max(1_000).default(100).describe('Greatest number of messages to return'),
});

/**
 * `Method` named `listMessages`, which returns the messages of the message log after an identifier, or the latest
 * messages without one, in the order of the log. With a session, returns only the messages of that session.
 */
export const listMessagesMethod: Method<typeof PARAMS, { readonly messages: readonly LoggedMessage[] }> = {
  name: 'listMessages',
  description: 'Returns the messages of the message log of the repository after an identifier, or the latest ones.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId, after, limit }, { messageLog }) => ({
    messages: await messageLog.list({ sessionId, after, limit }),
  }),
};
