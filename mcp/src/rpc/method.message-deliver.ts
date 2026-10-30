import { z } from 'zod';
import { deliverUserMessage } from './deliver-message.ts';
import type { Method } from './method.ts';

/**
 * Schema of the parameters of `messageDeliver`.
 */
const PARAMS = z.object({
  sessionId: z.string().describe('Identifier of the attached session or subagent to deliver the message to'),
  content: z.string().min(1).describe('Text of the message'),
});

/**
 * `Method` named `messageDeliver`, which puts a message into the inbox of a bound session or of a started subagent,
 * and logs it as a message of the user, as `deliverUserMessage` does. A session without an inbox fails with invalid
 * parameters.
 */
export const messageDeliverMethod: Method<typeof PARAMS, void> = {
  name: 'messageDeliver',
  description: 'Puts a message into the inbox of an attached session of the repository, or of a subagent.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId, content }, context) => deliverUserMessage(sessionId, content, context),
};
