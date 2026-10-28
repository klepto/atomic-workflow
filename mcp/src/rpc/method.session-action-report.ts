import { z } from 'zod';
import type { Method } from './method.ts';

/**
 * Schema of the parameters of `sessionActionReport`.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Identifier of the session whose newest action to report'),
  action: z.string().min(1).nullable().describe('Newest tool call of the agent in one line, or null for none'),
  at: z.number().int().nonnegative().describe('Time from which the action stands in ms since the epoch'),
});

/**
 * `Method` named `sessionActionReport`, which sets the newest action of the agent of a session in its current turn.
 * A report older than the latest action of the session, or than the end of its latest turn, is ignored. Agents do not
 * call it as a tool.
 */
export const sessionActionReportMethod: Method<typeof PARAMS, void> = {
  name: 'sessionActionReport',
  description: 'Reports the newest tool call of the agent of a session, or that it has none.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId, action, at }, { activity }) => {
    activity.reportAction(sessionId, action, at);
  },
};
