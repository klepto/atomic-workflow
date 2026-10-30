import { z } from 'zod';
import type { Method } from './method.ts';
import type { SessionMethodContext } from './session-method.ts';

/**
 * Schema of the parameters of `subagentFollow`.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Identifier of the session of the subagent'),
  parentId: z.string().min(1).describe('Identifier of the orchestrator session that the subagent runs inside'),
  oneShot: z
    .boolean()
    .default(false)
    .describe(
      'Whether the agent starts the subagent after the call, and the subagent ends once it finishes its prompt',
    ),
});

/**
 * `Method` named `subagentFollow` of a session server, which starts to log the transcript of a subagent of its
 * session, and resolves without waiting for the log. A one-shot subagent is one that the agent starts after the call,
 * and that ends once it finishes its prompt.
 */
export const subagentFollowSessionMethod: Method<typeof PARAMS, void, SessionMethodContext> = {
  name: 'subagentFollow',
  description: 'Logs the transcript of a subagent of the session.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId, parentId, oneShot }, { followSubagent }) => followSubagent(sessionId, parentId, oneShot),
};
