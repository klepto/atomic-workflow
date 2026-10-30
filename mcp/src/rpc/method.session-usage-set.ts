import { z } from 'zod';
import type { Method } from './method.ts';
import { registeredSession } from './registered-session.ts';

/**
 * Schema of the parameters of `sessionUsageSet`.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Identifier of the registered session'),
  contextTokens: z
    .number()
    .int()
    .nonnegative()
    .describe('Size of the context of the session in tokens, as the usage of its newest model request shows it'),
  model: z
    .string()
    .min(1)
    .nullable()
    .describe('Identifier of the model that answered the newest model request, or null when it is not known'),
  effort: z
    .string()
    .min(1)
    .nullable()
    .describe('Reasoning effort of the newest model request, or null when it is not known'),
});

/**
 * `Method` named `sessionUsageSet`, which sets the context size of a session to `contextTokens` tokens, its model to
 * `model` and its effort to `effort`, and stores them with the session, so they stay once the session ended. A session
 * that is not registered fails with invalid parameters. Agents do not call it as a tool.
 */
export const sessionUsageSetMethod: Method<typeof PARAMS, void> = {
  name: 'sessionUsageSet',
  description: 'Sets the context size, the model and the effort of a session, from its newest model request.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId, ...usage }, { sessions }) => {
    await registeredSession(sessionId, sessions);
    await sessions.setUsage(sessionId, usage);
  },
};
