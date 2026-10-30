import { z } from 'zod';
import { SESSION_ALIAS_MAX_LENGTH } from '../storage/session-store.ts';
import type { Method } from './method.ts';
import { registeredSession } from './registered-session.ts';

/**
 * Schema of the parameters of `sessionAliasSet`.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Identifier of the registered session'),
  alias: z
    .string()
    .min(1)
    .max(SESSION_ALIAS_MAX_LENGTH)
    .regex(/^[^\r\n]*$/, 'An alias holds no line break')
    .nullable()
    .describe(
      `Display name of the session, 1 to ${SESSION_ALIAS_MAX_LENGTH} characters with no line break, or null for none`,
    ),
});

/**
 * `Method` named `sessionAliasSet`, which replaces the alias of a session, its display name, with `alias`, or clears it
 * for `null`. It works for every session, orchestrator or subagent, attached or ended. A session that is not
 * registered fails with invalid parameters.
 */
export const sessionAliasSetMethod: Method<typeof PARAMS, void> = {
  name: 'sessionAliasSet',
  description: 'Replaces the alias of a session, the name that shows in place of its id, or clears it for null.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId, alias }, { sessions }) => {
    await registeredSession(sessionId, sessions);
    await sessions.setAlias(sessionId, alias);
  },
};
