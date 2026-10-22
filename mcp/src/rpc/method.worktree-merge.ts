import { z } from 'zod';
import type { Task, Ticket } from '../storage/task-store.ts';
import type { MergedTask, MergedTicket } from '../worktree/worktrees.ts';
import { taskGetMethod } from './method.task-get.ts';
import type { Method, MethodContext } from './method.ts';
import { callHolder, claimTickets, endWork, openTicket, releaseTickets, worktreeCall } from './open-ticket.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';

/**
 * Pattern of the summary line of a commit message: a type of the conventional commits, an optional scope, an
 * optional `!` and a description.
 */
const SUMMARY_LINE = /^(feat|fix|chore|refactor|docs|test|perf|build|ci|style|revert)(\([^()\r\n]+\))?!?: \S/;

/**
 * Schema of the parameters of `worktreeMerge`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task'),
  ticketId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Identifier of the ticket to land on the task branch. Without it, lands the task branch on the base branch once every ticket of the task is done',
    ),
  message: z
    .string()
    .trim()
    .regex(SUMMARY_LINE, 'Must start with a summary line such as "feat: ...", "fix(scope): ..." or "chore: ..."')
    .optional()
    .describe(
      'Message of the one commit of the ticket: a summary line of the conventional commits, such as "feat: ..." or "fix: ...", then optionally a blank line and a body. Only with a ticket, and needed with one',
    ),
});

/**
 * Result of `worktreeMerge` for a ticket.
 */
interface TicketMergeResult extends MergedTicket {
  /**
   * Ticket with its progress after the merge.
   */
  readonly ticket: Ticket;
}

/**
 * Result of `worktreeMerge` for a task.
 */
interface TaskMergeResult extends MergedTask {
  /**
   * Task with its status after the merge.
   */
  readonly task: Task;
}

/**
 * `Method` named `worktreeMerge`. With a ticket, it lands the work of a ticket in progress or blocked on the task
 * branch as one commit, and sets the ticket `needs-review`. The merge releases the claim of the ticket. A merge that
 * fails leaves the claim with a connected caller, which holds the ticket while it resolves a conflict. Without a
 * ticket, it lands the task branch of a task whose tickets are all `done` on its base branch, removes every worktree
 * and branch of the task, and sets the task `done`. A call after a conflict, once the conflicting files are resolved
 * and added, continues the rebase. A task or a ticket that does not exist, and a message without a ticket or a ticket
 * without a message, fail with invalid parameters. A task whose plan is not complete, a ticket in another status, a
 * ticket that another session holds, and a refusal of git, such as a conflict, fail with an invalid request.
 */
export const worktreeMergeMethod: Method<typeof PARAMS, TicketMergeResult | TaskMergeResult> = {
  name: 'worktreeMerge',
  description:
    'With a ticket, squashes the commits of the worktree of a ticket of the atomic workflow into one commit with the message, rebases it onto the task branch, moves the task branch forward to it, and sets the ticket needs-review. Without a ticket, once every ticket of the task is done, rebases the task branch onto its base branch, moves the base branch forward to it, deletes the worktrees and branches of the task, and sets the task done. On a conflict, resolve and add the files in the worktree that the error names, then call it again.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId, ticketId, message }, context) => {
    if (ticketId === undefined) {
      if (message !== undefined)
        throw new RpcError(RpcErrorCode.INVALID_PARAMS, 'Only the merge of a ticket takes a message');
      return mergeTask(taskId, context);
    }
    if (message === undefined) throw new RpcError(RpcErrorCode.INVALID_PARAMS, 'The merge of a ticket needs a message');
    return mergeTicket(taskId, ticketId, message, context);
  },
};

/**
 * Returns the work of the ticket `ticketId` of the task `taskId` after it landed on the task branch as one commit with
 * the message `message`, with the services of `context`, and sets the ticket `needs-review`.
 */
const mergeTicket = async (
  taskId: number,
  ticketId: number,
  message: string,
  context: MethodContext,
): Promise<TicketMergeResult> => {
  const { task, ticket } = await openTicket(taskId, ticketId, context);
  if (ticket.status !== 'in-progress' && ticket.status !== 'blocked')
    throw new RpcError(
      RpcErrorCode.INVALID_REQUEST,
      `Ticket ${ticketId} is ${ticket.status}, and only a ticket in progress or blocked can merge`,
    );
  const claimed = claimTickets(taskId, [ticketId], callHolder(context), context);
  try {
    const merged = await worktreeCall(() => context.worktrees.merge(task, ticket, message));
    const progress = { status: 'needs-review', stage: null, blockedReason: null } as const;
    await context.tasks.setTicketProgress(taskId, ticketId, progress);
    releaseTickets(taskId, [ticketId], context);
    return { ...merged, ticket: { ...ticket, ...progress } };
  } catch (error) {
    // A connected caller keeps the ticket while it resolves a conflict. Any other caller cannot release it later.
    if (context.caller === undefined) releaseTickets(taskId, claimed, context);
    throw error;
  }
};

/**
 * Returns the work of the task `taskId` after its task branch landed on its base branch, with the services of
 * `context`, and sets the task `done`. The merge holds every ticket of the task while it runs.
 */
const mergeTask = async (taskId: number, context: MethodContext): Promise<TaskMergeResult> => {
  const { tickets } = await taskGetMethod.handle({ task: taskId }, context);
  return endWork(
    taskId,
    tickets.map(({ id }) => id),
    context,
    async () => {
      // The task is read again under the claims, so a merge that ran in between is seen.
      const task = await taskGetMethod.handle({ task: taskId }, context);
      const baseBranch = checkMergeable(task);
      const merged = await worktreeCall(() => context.worktrees.mergeTask(task, baseBranch));
      await context.tasks.setStatus(taskId, 'done');
      return { ...merged, task: { ...task, status: 'done' } };
    },
  );
};

/**
 * Returns the base branch of `task`, whose task branch can land on it. A task that is not complete, has a ticket that
 * is not done, or has no base branch fails with an invalid request.
 */
const checkMergeable = (task: Task): string => {
  if (task.status === 'done')
    throw new RpcError(RpcErrorCode.INVALID_REQUEST, `Task ${task.id} is done, and its branch landed already`);
  if (task.status !== 'complete')
    throw new RpcError(RpcErrorCode.INVALID_REQUEST, `The plan of task ${task.id} is not complete. Complete it first`);
  const open = task.tickets.filter(({ status }) => status !== 'done').map(({ id }) => id);
  if (open.length > 0)
    throw new RpcError(
      RpcErrorCode.INVALID_REQUEST,
      `${open.length === 1 ? 'Ticket' : 'Tickets'} ${open.join(', ')} of task ${task.id} ${open.length === 1 ? 'is' : 'are'} not done, so the task branch cannot land`,
    );
  if (task.baseBranch === null)
    throw new RpcError(RpcErrorCode.INVALID_REQUEST, `Task ${task.id} has no base branch to land its task branch on`);
  return task.baseBranch;
};
