import { z } from 'zod';
import { ACTIVITY_STATUSES } from '../attachment/session-activity.ts';
import type { Method } from './method.ts';

/**
 * Schema of the parameters of `sessionActivityReport`.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Identifier of the session whose status to report'),
  status: z.enum(ACTIVITY_STATUSES).describe('Status of the agent of the session: idle, working or waiting'),
  at: z.number().int().nonnegative().optional().describe('Time from which the status stands in ms since the epoch'),
});

/**
 * `Method` named `sessionActivityReport`, which sets the status of the agent of a session. A report without a time
 * gets the time of the call. A report older than the latest report of the session is ignored. When the report ends a
 * turn of a subagent, it asks for a refresh of the usage limits, since the turn spent some of them. Agents do not call
 * it as a tool.
 */
export const sessionActivityReportMethod: Method<typeof PARAMS, void> = {
  name: 'sessionActivityReport',
  description: 'Reports whether the agent of a session is idle, works, or waits for the user.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId, status, at }, { activity, sessions, usageRefresher, clock }) => {
    const before = activity.get(sessionId)?.status;
    const changed = activity.report(sessionId, status, at ?? clock.now());
    if (!changed || status !== 'idle' || before === 'idle') return;
    const session = await sessions.get(sessionId);
    if (session?.role === 'subagent') usageRefresher.request();
  },
};
