import { z } from 'zod';
import { TICKET_STAGES, TICKET_STATUSES, type Ticket } from '../storage/task-store.ts';
import type { Method } from './method.ts';
import { setTicketStatus } from './set-ticket-status.ts';

/**
 * Schema of the parameters of `ticketSetStatus`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task'),
  ticketId: z.number().int().positive().describe('Identifier of the ticket within its task'),
  status: z
    .enum(TICKET_STATUSES)
    .exclude(['needs-review'])
    .describe(
      'Status to set: in-progress while the work runs, blocked while it waits for the cause that reason names, done once the review of the landed work passed, not-started to start over. worktreeMerge sets needs-review',
    ),
  stage: z
    .enum(TICKET_STAGES)
    .nullable()
    .optional()
    .describe(
      'Stage of a ticket of the type code that is in progress or blocked: prototype, tests or refactor. Leave it out to keep the stored stage',
    ),
  reason: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Cause that a blocked ticket waits for, in one sentence. Only for the status blocked'),
});

/**
 * `Method` named `ticketSetStatus`, which sets the progress of a ticket of a task whose plan is complete, and returns
 * the ticket, as `setTicketStatus` does, and fails as it does.
 */
export const ticketSetStatusMethod: Method<typeof PARAMS, Ticket> = {
  name: 'ticketSetStatus',
  description:
    'Sets the status of a ticket of the atomic workflow, with the stage of its work and the reason that it is blocked, and returns the ticket.',
  agent: true,
  params: PARAMS,
  handle: async (params, context) => setTicketStatus(params, context),
};
