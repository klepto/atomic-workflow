import { z } from 'zod';
import type { Method } from './method.ts';
import type { SessionMethodContext } from './session-method.ts';

/**
 * Schema of the parameters of `deliver`.
 */
const PARAMS = z.object({ content: z.string().min(1).describe('Text of the message') });

/**
 * `Method` named `deliver` of a session server, which puts a message into the chat of its session.
 */
export const deliverMethod: Method<typeof PARAMS, void, SessionMethodContext> = {
  name: 'deliver',
  description: 'Puts a message into the chat of the session.',
  agent: false,
  params: PARAMS,
  handle: ({ content }, { pushMessage }) => pushMessage(content),
};
