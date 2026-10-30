import { z } from 'zod';
import type { Task, Ticket } from '../storage/task-store.ts';
import type { CreatedWorktrees } from '../worktree/worktrees.ts';
import { claimTickets, lastingHolder, releaseTickets } from './claim-tickets.ts';
import type { Method, MethodContext } from './method.ts';
import { hasLanded, pendingDependencies } from './plan-queries.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';
import { openTicket } from './task-guards.ts';
import { worktreeCall } from './worktree-call.ts';

/**
 * Schema of the parameters of `worktreeCreate`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task'),
  ticketId: z.number().int().positive().describe('Identifier of the ticket within its task'),
});

/**
 * Result of `worktreeCreate`.
 */
interface WorktreeCreateResult {
  /**
   * Worktrees of the task and of the ticket.
   */
  readonly worktrees: CreatedWorktrees;

  /**
   * Ticket with its progress after the start of its work.
   */
  readonly ticket: Ticket;
}

/**
 * `Method` named `worktreeCreate`, which starts the work on a ticket of a task whose plan is complete: it makes the
 * task branch, the ticket branch and their worktrees where they do not exist, records the base branch of the task on
 * its first start, and sets the ticket `in-progress`. Before it makes a ticket branch, it syncs the task branch with
 * the base branch, so the ticket starts from both. A sync that stops on a conflict fails, and a call again once the
 * conflicting files are resolved and added in the worktree of the task continues it. A blocked ticket keeps its
 * stage, and a ticket in progress stays as it is. The connection of the caller holds the claim of the ticket until the
 * work on it ends or the connection closes, and a call again over the same connection resumes the work. A task or a
 * ticket that does not exist fails with invalid parameters. A task whose plan is not complete, a ticket whose work
 * landed already, a dependency whose work has not landed, a caller without a connection, a ticket that another
 * session holds, and a refusal of git fail with an invalid request.
 */
export const worktreeCreateMethod: Method<typeof PARAMS, WorktreeCreateResult> = {
  name: 'worktreeCreate',
  description:
    'Starts the work on a ticket of the atomic workflow: makes the worktree of its task and its own worktree where they do not exist, sets it in-progress, and returns the paths and branches of both worktrees with the ticket. Before it makes the branch of the ticket, it rebases the task branch onto the local base branch. On a conflict of that rebase, resolve and add the files in the worktree of the task that the error names, then call it again.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId, ticketId }, context) => {
    const { task, ticket } = await openTicket(taskId, ticketId, context.tasks);
    if (hasLanded(ticket.status))
      throw new RpcError(RPC_ERROR_CODES.INVALID_REQUEST, `The work of ticket ${ticketId} landed already`);
    const pending = pendingDependencies(task, ticket);
    if (pending.length > 0)
      throw new RpcError(
        RPC_ERROR_CODES.INVALID_REQUEST,
        `Ticket ${ticketId} depends on tickets ${pending.join(', ')}, whose work has not landed yet`,
      );
    const claimed = claimTickets(taskId, [ticketId], lastingHolder(context), context);
    try {
      return await start(task, ticket, context);
    } catch (error) {
      releaseTickets(taskId, claimed, context);
      throw error;
    }
  },
};

/**
 * Returns the worktrees of `ticket` of `task`, made where they do not exist, with the ticket after it is set
 * `in-progress`, with the services of `context`.
 */
const start = async (task: Task, ticket: Ticket, context: MethodContext): Promise<WorktreeCreateResult> => {
  const worktrees = await worktreeCall(() => context.worktrees.create(task, ticket, task.baseBranch));
  if (task.baseBranch === null) await context.tasks.setBaseBranch(task.id, worktrees.baseBranch);
  const progress = { status: 'in-progress', stage: ticket.stage, blockedReason: null } as const;
  await context.tasks.setTicketProgress(task.id, ticket.id, progress);
  return { worktrees, ticket: { ...ticket, ...progress } };
};
