import { z } from 'zod';
import { TICKET_STAGES, type Ticket, type TicketProgress } from '../storage/task-store.ts';
import { taskGetMethod } from './method.task-get.ts';
import type { Method, MethodContext } from './method.ts';
import { claimTickets, endWork, hasLanded, lastingHolder, openTicket } from './open-ticket.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';

/**
 * Schema of the parameters of `ticketSetStatus`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task'),
  ticketId: z.number().int().positive().describe('Identifier of the ticket within its task'),
  status: z
    .enum(['not-started', 'in-progress', 'blocked', 'done'])
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
 * the ticket. `done` needs a ticket that `needs-review`, and whose follow-up tickets, which fix it, have all landed.
 * `not-started`, `in-progress` and `blocked` need a ticket whose
 * work has not landed. `blocked` needs a reason, and only `blocked` takes one. A stage needs a ticket of the type
 * `code` that is in progress or blocked, which keep their stored stage when the call leaves it out. Every other status
 * clears the stage. `in-progress` claims the ticket for the connection of the caller, as `worktreeCreate` does, and
 * every other status ends the work on it, and releases its claim. A task or a ticket that does not exist fails with
 * invalid parameters. A ticket that another session holds, and every other refusal, fail with an invalid request.
 */
export const ticketSetStatusMethod: Method<typeof PARAMS, Ticket> = {
  name: 'ticketSetStatus',
  description:
    'Sets the status of a ticket of the atomic workflow, with the stage of its work and the reason that it is blocked, and returns the ticket.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId, ticketId, status, stage, reason }, context) => {
    const { ticket } = await openTicket(taskId, ticketId, context);
    const refusal = refusalOf(ticket, status, stage, reason);
    if (refusal !== undefined) throw new RpcError(RpcErrorCode.INVALID_REQUEST, refusal);
    const working = status === 'in-progress' || status === 'blocked';
    const progress: TicketProgress = {
      status,
      stage: working ? (stage === undefined ? ticket.stage : stage) : null,
      blockedReason: reason ?? null,
    };
    const store = async (): Promise<Ticket> => {
      if (status === 'done') await checkFollowUps(taskId, ticketId, context);
      await context.tasks.setTicketProgress(taskId, ticketId, progress);
      return { ...ticket, ...progress };
    };
    if (status !== 'in-progress') return endWork(taskId, [ticketId], context, store);
    claimTickets(taskId, [ticketId], lastingHolder(context), context);
    return store();
  },
};

/**
 * Checks that every follow-up ticket of the ticket `ticketId` of the task `taskId`, which fixes it, has landed, with
 * the services of `context`. It reads the task again, so it sees a follow-up ticket that was stored since. A follow-up
 * ticket that has not landed fails with an invalid request, whose message names it.
 */
const checkFollowUps = async (taskId: number, ticketId: number, context: MethodContext): Promise<void> => {
  const { tickets } = await taskGetMethod.handle({ task: taskId }, context);
  const pending = tickets
    .filter(({ fixes, status }) => fixes === ticketId && !hasLanded(status))
    .map(({ id, slug, status }) => `${id}-${slug} (${status})`);
  if (pending.length === 0) return;
  const one = pending.length === 1;
  throw new RpcError(
    RpcErrorCode.INVALID_REQUEST,
    `Ticket ${ticketId} waits for its follow-up ${one ? 'ticket' : 'tickets'} ${pending.join(', ')}, which ${one ? 'fixes' : 'fix'} it and ${one ? 'has' : 'have'} not landed yet. Land ${one ? 'it' : 'them'} first`,
  );
};

/**
 * Returns the reason why `ticket` cannot get the status `status` with the stage `stage` and the reason `reason`, or
 * `undefined` when it can.
 */
const refusalOf = (
  ticket: Ticket,
  status: z.output<typeof PARAMS>['status'],
  stage: string | null | undefined,
  reason: string | undefined,
): string | undefined => {
  const landed = hasLanded(ticket.status);
  if (status === 'done' && ticket.status !== 'needs-review')
    return `Ticket ${ticket.id} is ${ticket.status}, and only a ticket that needs review can be done`;
  if (status !== 'done' && landed)
    return `The work of ticket ${ticket.id} landed already, so it cannot be ${status} again. To fix it, add a follow-up ticket that fixes it`;
  if ((status === 'blocked') !== (reason !== undefined))
    return 'A reason is needed for the status blocked, and only for it';
  if (stage === undefined || stage === null) return undefined;
  if (status !== 'in-progress' && status !== 'blocked') return `A ticket that is ${status} has no stage`;
  if (ticket.type !== 'code') return `Ticket ${ticket.id} is of the type ${ticket.type}, which has no stages`;
  return undefined;
};
