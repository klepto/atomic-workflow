import { z } from 'zod';
import type { Method } from './method.ts';
import { registeredSession } from './registered-session.ts';
import { isTicketJob } from './session-name.ts';

/**
 * Schema of the parameters of `sessionTicketSet`.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Identifier of the registered session'),
  ticketId: z.number().int().positive().describe('Identifier of the ticket that the session works on'),
});

/**
 * `Method` named `sessionTicketSet`, which sets the ticket that a subagent works on to `ticketId`, a ticket of its
 * task, such as once the subagent has made the worktree of the ticket. Only a subagent whose job works on one ticket,
 * such as `implement`, takes a ticket. A subagent that works on a ticket already keeps it, and so does a subagent that
 * works on no task. A session that is not registered fails with invalid parameters.
 */
export const sessionTicketSetMethod: Method<typeof PARAMS, void> = {
  name: 'sessionTicketSet',
  description: 'Sets the ticket that a subagent works on, unless it works on a ticket already.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId, ticketId }, { sessions }) => {
    const session = await registeredSession(sessionId, sessions);
    if (session.role === 'subagent' && isTicketJob(session.job)) await sessions.setTicket(sessionId, ticketId);
  },
};
