import { z } from 'zod';
import type { DeletedWorktrees } from '../worktree/worktrees.ts';
import { taskGetMethod } from './method.task-get.ts';
import type { Method, MethodContext } from './method.ts';
import { endWork, worktreeCall } from './open-ticket.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';
import type { Task } from '../storage/task-store.ts';

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
 * `not-started` again. A forced deletion of a task sets every ticket of the task `not-started`, and forgets its base
 * branch. The deletion ends the work on each ticket that it covers, and releases its claim. A task or a ticket that
 * does not exist fails with invalid parameters. A ticket that another session holds, and a refusal, fail with an
 * invalid request.
 */
export const worktreeDeleteMethod: Method<typeof PARAMS, DeletedWorktrees> = {
  name: 'worktreeDelete',
  description:
    'Deletes the worktree and the branch of a ticket of the atomic workflow, or without a ticket, every worktree and branch of the task. Refuses to lose work that has not landed unless forced.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId, ticketId, force }, context) => {
    const task = await taskGetMethod.handle({ task: taskId }, context);
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
  const ticket = task.tickets.find(({ id }) => id === ticketId);
  if (ticket === undefined)
    throw new RpcError(RpcErrorCode.INVALID_PARAMS, `Task ${task.id} has no ticket ${ticketId}`);
  return endWork(task.id, [ticketId], context, async () => {
    const deleted = await worktreeCall(() => context.worktrees.deleteTicket(task, ticket, force));
    if (ticket.status === 'in-progress' || ticket.status === 'blocked')
      await context.tasks.setTicketProgress(task.id, ticketId, NOT_STARTED);
    return deleted;
  });
};

/**
 * Returns what the removal of every worktree and branch of `task` removed, with the services of `context`. After a
 * forced removal, sets every ticket of `task` `not-started`, and forgets its base branch.
 */
const deleteTask = async (task: Task, force: boolean, context: MethodContext): Promise<DeletedWorktrees> => {
  const ticketIds = task.tickets.map(({ id }) => id);
  return endWork(task.id, ticketIds, context, async () => {
    const deleted = await worktreeCall(() => context.worktrees.deleteTask(task, task.baseBranch, force));
    if (!force) return deleted;
    for (const id of ticketIds) await context.tasks.setTicketProgress(task.id, id, NOT_STARTED);
    await context.tasks.setBaseBranch(task.id, null);
    return deleted;
  });
};
