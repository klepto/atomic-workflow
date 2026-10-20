import { z } from 'zod';
import type { Method } from './method.ts';

/**
 * Schema of the parameters of `endSubagent`.
 */
const PARAMS = z.object({
  sessionId: z.string().describe('Session id of the subagent that has ended'),
});

/**
 * `Method` named `endSubagent`, which removes a subagent that has ended from the started subagents, so it no longer
 * takes messages. A session that is no started subagent, such as one that `stopSubagent` stopped already, is left as
 * it is.
 */
export const endSubagentMethod: Method<typeof PARAMS, void> = {
  name: 'endSubagent',
  description: 'Removes a subagent that has ended from the started subagents.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId }, { subagents }) => {
    subagents.stop(sessionId);
  },
};
