import { z } from 'zod';
import type { Method } from './method.ts';
import type { SessionMethodContext } from './session-method.ts';

/**
 * Schema of the parameters of `subagentFollow`.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Identifier of the session of the subagent'),
  parentId: z.string().min(1).describe('Identifier of the orchestrator session that the subagent runs inside'),
});

/**
 * `Method` named `subagentFollow` of a session server, which starts to log the transcript of a subagent of its
 * session, and resolves without waiting for the log.
 */
export const subagentFollowMethod: Method<typeof PARAMS, void, SessionMethodContext> = {
  name: 'subagentFollow',
  description: 'Logs the transcript of a subagent of the session.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId, parentId }, { followSubagent }) => followSubagent(sessionId, parentId),
};
