import { z } from 'zod';
import type { Method } from './method.ts';

/**
 * Schema of the parameters of `subagentEnd`.
 */
const PARAMS = z.object({
  sessionId: z.string().describe('Session id of the subagent that has ended'),
});

/**
 * `Method` named `subagentEnd`, which removes a subagent that has ended from the started subagents, and closes its
 * inbox, so it no longer takes messages. A session that is no started subagent, such as one that `subagentStop`
 * stopped already, is left as it is.
 */
export const subagentEndMethod: Method<typeof PARAMS, void> = {
  name: 'subagentEnd',
  description: 'Removes a subagent that has ended from the started subagents.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId }, { subagents, inboxes }) => {
    if (subagents.stop(sessionId)) inboxes.close(sessionId);
  },
};
