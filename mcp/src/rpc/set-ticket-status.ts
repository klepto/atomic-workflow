import type { Ticket, TicketProgress, TicketStage, TicketStatus } from '../storage/task-store.ts';
import { claimTickets, endWork, lastingHolder } from './claim-tickets.ts';
import { findTask } from './find-task.ts';
import type { MethodContext } from './method.ts';
import { hasLanded, isWorking } from './plan-queries.ts';
import { plural } from './plural.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';
import { openTicket } from './task-guards.ts';

/**
 * Status that a call can set on a ticket: every status but `needs-review`, which only the merge of the ticket sets.
 */
type SettableTicketStatus = Exclude<TicketStatus, 'needs-review'>;

/**
 * Change of the progress of a ticket.
 */
interface TicketStatusChange {
  /**
   * Identifier of the task.
   */
  readonly taskId: number;

  /**
   * Identifier of the ticket within its task.
   */
  readonly ticketId: number;

  /**
   * Status to set.
   */
  readonly status: SettableTicketStatus;

  /**
   * Stage to set, `null` for none, or `undefined` to keep the stored stage of a ticket in progress or blocked.
   */
  readonly stage?: TicketStage | null;

  /**
   * Cause that a blocked ticket waits for, or `undefined` for a status other than `blocked`.
   */
  readonly reason?: string;
}

/**
 * Sets the progress of a ticket of a task whose plan is complete as `change` says, with the services of `context`, and
 * returns the ticket. `done` needs a ticket that `needs-review`, and whose follow-up tickets, which fix it, have all
 * landed. `not-started`, `in-progress` and `blocked` need a ticket whose work has not landed. `blocked` needs a reason,
 * and only `blocked` takes one. A stage needs a ticket of the type `code` that is in progress or blocked, which keep
 * their stored stage when `change` leaves it out. Every other status clears the stage. `in-progress` claims the ticket
 * for the connection of the caller, as `worktreeCreate` does, and every other status ends the work on it, and releases
 * its claim. A task or a ticket that does not exist fails with invalid parameters. A ticket that another session
 * holds, and every other refusal, fail with an invalid request. Rejects as the task store of `context` does.
 */
export const setTicketStatus = async (change: TicketStatusChange, context: MethodContext): Promise<Ticket> => {
  const { taskId, ticketId, status, stage, reason } = change;
  const { ticket } = await openTicket(taskId, ticketId, context.tasks);
  const refusal = refusalOf(ticket, change);
  if (refusal !== undefined) throw new RpcError(RPC_ERROR_CODES.INVALID_REQUEST, refusal);
  const progress: TicketProgress = {
    status,
    stage: isWorking(status) ? (stage === undefined ? ticket.stage : stage) : null,
    blockedReason: reason ?? null,
  };
  const store = async (): Promise<Ticket> => {
    if (status === 'done') await checkFollowUps(taskId, ticketId, context);
    await context.tasks.setTicketProgress(taskId, ticketId, progress);
    return { ...ticket, ...progress };
  };
  if (status !== 'in-progress') return endWork(taskId, [ticketId], store, context);
  claimTickets(taskId, [ticketId], lastingHolder(context), context);
  return store();
};

/**
 * Checks that every follow-up ticket of the ticket `ticketId` of the task `taskId`, which fixes it, has landed, with
 * the services of `context`. It reads the task again, so it sees a follow-up ticket that was stored since. A follow-up
 * ticket that has not landed fails with an invalid request, whose message names it.
 */
const checkFollowUps = async (taskId: number, ticketId: number, context: MethodContext): Promise<void> => {
  const { tickets } = await findTask(taskId, context.tasks);
  const pending = tickets
    .filter(({ fixes, status }) => fixes === ticketId && !hasLanded(status))
    .map(({ id, slug, status }) => `${id}-${slug} (${status})`);
  if (pending.length === 0) return;
  const count = pending.length;
  throw new RpcError(
    RPC_ERROR_CODES.INVALID_REQUEST,
    `Ticket ${ticketId} waits for its follow-up ${plural(count, 'ticket', 'tickets')} ${pending.join(', ')}, which ${plural(count, 'fixes', 'fix')} it and ${plural(count, 'has', 'have')} not landed yet. Land ${plural(count, 'it', 'them')} first`,
  );
};

/**
 * Returns the reason why `ticket` cannot change as `change` says, or `undefined` when it can.
 */
const refusalOf = (ticket: Ticket, { status, stage, reason }: TicketStatusChange): string | undefined => {
  if (status === 'done' && ticket.status !== 'needs-review')
    return `Ticket ${ticket.id} is ${ticket.status}, and only a ticket that needs review can be done`;
  if (status !== 'done' && hasLanded(ticket.status))
    return `The work of ticket ${ticket.id} landed already, so it cannot be ${status} again. To fix it, add a follow-up ticket that fixes it`;
  if ((status === 'blocked') !== (reason !== undefined))
    return 'A reason is needed for the status blocked, and only for it';
  if (stage === undefined || stage === null) return undefined;
  if (!isWorking(status)) return `A ticket that is ${status} has no stage`;
  if (ticket.type !== 'code') return `Ticket ${ticket.id} is of the type ${ticket.type}, which has no stages`;
  return undefined;
};
