import { z } from 'zod';
import type { TicketCommit } from '../worktree/worktrees.ts';
import { taskGetMethod } from './method.task-get.ts';
import type { Method } from './method.ts';
import { worktreeCall } from './open-ticket.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';

/**
 * Schema of the parameters of `ticketDiff`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task'),
  ticketId: z.number().int().positive().describe('Identifier of the ticket within its task'),
});

/**
 * `Method` named `ticketDiff`, which returns the commit that holds the landed work of a ticket, with its patch, for its
 * review. It looks on the task branch, or on the base branch of the task once the task branch is gone. It returns
 * `null` when no commit holds the work of the ticket: before it landed, when it changed nothing, or when it landed
 * before its commit named it. A task or a ticket that does not exist fails with invalid parameters.
 */
export const ticketDiffMethod: Method<typeof PARAMS, TicketCommit | null> = {
  name: 'ticketDiff',
  description:
    'Returns the commit that holds the landed work of a ticket of the atomic workflow, with its patch, or null when none does.',
  agent: false,
  params: PARAMS,
  handle: async ({ taskId, ticketId }, context) => {
    const task = await taskGetMethod.handle({ task: taskId }, context);
    const ticket = task.tickets.find(({ id }) => id === ticketId);
    if (ticket === undefined)
      throw new RpcError(RpcErrorCode.INVALID_PARAMS, `Task ${taskId} has no ticket ${ticketId}`);
    const found = await worktreeCall(() => context.worktrees.ticketCommit(task, ticket, task.baseBranch));
    return found ?? null;
  },
};
