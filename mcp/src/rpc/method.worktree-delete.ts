import { z } from 'zod';
import type { Task, Ticket } from '../storage/task-store.ts';
import type { DeletedWorktrees } from '../worktree/worktrees.ts';
import { endWork } from './claim-tickets.ts';
import { findTask } from './find-task.ts';
import type { Method, MethodContext } from './method.ts';
import { hasLanded, isWorking } from './plan-queries.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';
import { ticketOf } from './task-guards.ts';
import { worktreeCall } from './worktree-call.ts';

/**
 * Schema of the parameters of `worktreeDelete`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task'),
  ticketId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Identifier of the ticket whose worktree and branch to delete. Without it, deletes those of the task'),
  force: z
    .boolean()
    .default(false)
    .describe('Whether to delete branches whose commits have not landed, and worktrees with uncommitted changes'),
});

/**
 * Progress of a ticket whose work was thrown away.
 */
const NOT_STARTED = { status: 'not-started', stage: null, blockedReason: null } as const;

/**
 * `Method` named `worktreeDelete`, which removes the worktree and the branch of a ticket, or every worktree and branch
 * of a task, the task branch included, and returns what it removed. Without `force`, it removes nothing when a branch
 * holds commits that have not landed, on the task branch for a ticket branch and on the base branch for the task
 * branch, or a worktree has uncommitted changes. A ticket in progress or blocked whose branch is deleted is
 * `not-started` again. A forced deletion of a task sets `not-started` each ticket whose work it threw away: each ticket
 * in progress or blocked, and each landed ticket whose commits the task branch held but the base branch lacks. It
 * forgets the base branch once no ticket keeps its landed work. The deletion ends the work on each ticket that it
 * covers, and releases its claim. A task or a ticket that does not exist fails with invalid parameters. A ticket that
 * another session holds, a forced deletion of a done task, and a refusal, fail with an invalid request.
 */
export const worktreeDeleteMethod: Method<typeof PARAMS, DeletedWorktrees> = {
  name: 'worktreeDelete',
  description:
    'Deletes the worktree and the branch of a ticket of the atomic workflow, or without a ticket, every worktree and branch of the task. Refuses to lose work that has not landed unless forced.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId, ticketId, force }, context) => {
    const task = await findTask(taskId, context.tasks);
    if (ticketId === undefined) return deleteTask(task, force, context);
    return deleteTicket(task, ticketId, force, context);
  },
};

/**
 * Returns what the removal of the worktree and the branch of the ticket `ticketId` of `task` removed, with the
 * services of `context`, and sets a ticket in progress or blocked `not-started` again.
 */
const deleteTicket = async (
  task: Task,
  ticketId: number,
  force: boolean,
  context: MethodContext,
): Promise<DeletedWorktrees> => {
  const ticket = ticketOf(task, ticketId);
  const remove = async (): Promise<DeletedWorktrees> => {
    const deleted = await worktreeCall(() => context.worktrees.deleteTicket(task, ticket, force));
    if (isWorking(ticket.status)) await context.tasks.setTicketProgress(task.id, ticketId, NOT_STARTED);
    return deleted;
  };
  return endWork(task.id, [ticketId], remove, context);
};

/**
 * Returns what the removal of every worktree and branch of `task` removed, with the services of `context`. A forced
 * removal on a done task fails with an invalid request, and removes nothing. After a forced removal, sets
 * `not-started` each ticket whose work it threw away: a ticket in progress or blocked, and a landed ticket whose
 * commits the task branch held but the base branch lacks. Once no ticket keeps its landed work, forgets the base
 * branch of `task`.
 */
const deleteTask = async (task: Task, force: boolean, context: MethodContext): Promise<DeletedWorktrees> => {
  if (force && task.status === 'done')
    throw new RpcError(
      RPC_ERROR_CODES.INVALID_REQUEST,
      `Task ${task.id} is done, so a forced deletion cannot reset its tickets`,
    );
  const ticketIds = task.tickets.map(({ id }) => id);
  const remove = async (): Promise<DeletedWorktrees> => {
    if (!force) return worktreeCall(() => context.worktrees.deleteTask(task, task.baseBranch, force));
    // The trailers that tell which tickets lose their work go away with the task branch, so they are read first.
    const unlanded = await worktreeCall(() => context.worktrees.unlandedTickets(task, task.baseBranch));
    const deleted = await worktreeCall(() => context.worktrees.deleteTask(task, task.baseBranch, force));
    const lost = task.tickets.filter((ticket) => isThrownAway(ticket, unlanded));
    for (const { id } of lost) await context.tasks.setTicketProgress(task.id, id, NOT_STARTED);
    const keepsWork = task.tickets.some((ticket) => hasLanded(ticket.status) && !lost.includes(ticket));
    if (!keepsWork) await context.tasks.setBaseBranch(task.id, null);
    return deleted;
  };
  return endWork(task.id, ticketIds, remove, context);
};

/**
 * Returns whether a forced removal of the task branch throws away the work of `ticket`: a ticket in progress or
 * blocked, or a landed ticket whose id is one of `unlanded`, the tickets whose commits the base branch lacks.
 */
const isThrownAway = (ticket: Ticket, unlanded: readonly number[]): boolean =>
  isWorking(ticket.status) || (hasLanded(ticket.status) && unlanded.includes(ticket.id));
