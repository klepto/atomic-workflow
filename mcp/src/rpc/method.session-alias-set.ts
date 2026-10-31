import { z } from 'zod';
import { SESSION_ALIAS_MAX_LENGTH } from '../storage/session-store.ts';
import type { Method } from './method.ts';
import { registeredSession } from './registered-session.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';
import { MAIN_ALIAS } from './session-name.ts';

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
 * `Method` named `sessionAliasSet`, which replaces the alias of a session, the name of its chat, with `alias`, or
 * clears it for `null`. It works for every session, attached or ended. The alias `main` is reserved for the
 * orchestrator sessions, which share the chat of the main session: the alias `main` on a subagent fails with invalid
 * parameters, and so does any other alias, or `null`, on an orchestrator session. A session that is not registered
 * fails with invalid parameters too.
 */
export const sessionAliasSetMethod: Method<typeof PARAMS, void> = {
  name: 'sessionAliasSet',
  description: 'Replaces the alias of a session, the name that shows in place of its id, or clears it for null.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId, alias }, { sessions }) => {
    const session = await registeredSession(sessionId, sessions);
    if (session.role === 'subagent' && alias === MAIN_ALIAS)
      throw new RpcError(
        RPC_ERROR_CODES.INVALID_PARAMS,
        `The alias ${MAIN_ALIAS} is reserved for orchestrator sessions`,
      );
    if (session.role === 'orchestrator' && alias !== MAIN_ALIAS)
      throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, `An orchestrator session holds the alias ${MAIN_ALIAS} only`);
    await sessions.setAlias(sessionId, alias);
  },
};
