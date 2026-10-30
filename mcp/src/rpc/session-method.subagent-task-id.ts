import { z } from 'zod';
import type { Method } from './method.ts';
import type { SessionMethodContext } from './session-method.ts';

/**
 * Schema of the parameters of `subagentTaskId` of a session server.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Identifier of the session of the subagent'),
});

/**
 * `Method` named `subagentTaskId` of a session server, which returns the id of the background task that runs a
 * subagent of its session, by which the agent of the session stops it, or `null` while the session server knows none.
 */
export const subagentTaskIdSessionMethod: Method<
  typeof PARAMS,
  { readonly backgroundTaskId: string | null },
  SessionMethodContext
> = {
  name: 'subagentTaskId',
  description: 'Returns the id of the background task that runs a subagent of the session.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId }, { subagentTaskId }) => ({ backgroundTaskId: subagentTaskId(sessionId) ?? null }),
};
