import { z } from 'zod';
import type { TicketCommit } from '../worktree/worktrees.ts';
import { findTask } from './find-task.ts';
import type { Method } from './method.ts';
import { ticketOf } from './task-guards.ts';
import { worktreeCall } from './worktree-call.ts';

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
 * before its commit named it. A task or a ticket that does not exist fails with invalid parameters, and a refusal of
 * git with an invalid request.
 */
export const ticketDiffMethod: Method<typeof PARAMS, TicketCommit | null> = {
  name: 'ticketDiff',
  description:
    'Returns the commit that holds the landed work of a ticket of the atomic workflow, with its patch, or null when none does.',
  agent: false,
  params: PARAMS,
  handle: async ({ taskId, ticketId }, context) => {
    const task = await findTask(taskId, context.tasks);
    const ticket = ticketOf(task, ticketId);
    const found = await worktreeCall(() => context.worktrees.ticketCommit(task, ticket, task.baseBranch));
    return found ?? null;
  },
};
