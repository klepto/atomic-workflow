import { z } from 'zod';
import type { Task, Ticket } from '../storage/task-store.ts';
import { taskBranchOf } from '../worktree/worktree-layout.ts';
import type { DeletedWorktrees, MergedTask, MergedTicket, RebaseChecks } from '../worktree/worktrees.ts';
import { callHolder, claimTickets, endWork, releaseTickets } from './claim-tickets.ts';
import { findTask } from './find-task.ts';
import type { Method, MethodContext } from './method.ts';
import { isWorking } from './plan-queries.ts';
import { plural } from './plural.ts';
import { REBASE_CHECKS } from './rebase-checks.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';
import { checkComplete, openTicket } from './task-guards.ts';
import { worktreeCall } from './worktree-call.ts';

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
  checks: REBASE_CHECKS.optional(),
});

/**
 * Removal that removed nothing.
 */
const NOTHING_DELETED: DeletedWorktrees = { worktrees: [], branches: [], stoppedProcesses: [], warnings: [] };

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
 * branch as one commit, and sets the ticket `needs-review`. The merge releases the claim of the ticket. A merge of a
 * ticket that stopped at any step, such as on a crash, finishes when it is called again, and a ticket that needs
 * review, whose commit is on the task branch, returns its result again. A merge that fails leaves the claim with a
 * connected caller, which holds the ticket while it resolves a conflict. Without a ticket, it lands the task branch
 * of a task whose tickets are all `done` on its base branch, removes every worktree and branch of the task, and sets
 * the task `done`. A call after a conflict, once the conflicting files are resolved and added, continues the rebase. A
 * rebase of the task branch that rewrites the commits of landed tickets fails with the refusal `needs-checks` for its
 * candidate, and a call again with `checks` lands it, or drops it on a failed check. A merge of a task that stopped at
 * any step finishes when it is called again, and a task that is done returns its result again, with nothing deleted.
 * A task or a ticket that does not exist, a message without a ticket or a ticket without a message, `checks` with a
 * ticket, and `checks` that name no candidate fail with invalid parameters. A task whose plan is not complete, a
 * ticket in another status, a ticket that another session holds, and a refusal of git, such as a conflict, fail with
 * an invalid request.
 */
export const worktreeMergeMethod: Method<typeof PARAMS, TicketMergeResult | TaskMergeResult> = {
  name: 'worktreeMerge',
  description:
    'With a ticket, squashes the commits of the worktree of a ticket of the atomic workflow into one commit with the message, rebases it onto the task branch, moves the task branch forward to it, and sets the ticket needs-review. A call with a ticket that stopped finishes when it is called again with the same arguments. Without a ticket, once every ticket of the task is done, rebases the task branch onto its base branch, moves the base branch forward to it, deletes the worktrees and branches of the task, and sets the task done. A call without a ticket that stopped finishes when it is called again with the same arguments, and a call for a task that is done returns its result again. On a conflict, resolve and add the files in the worktree that the error names, then call it again. When the rebase of the task branch rewrites landed tickets, it fails with the kind needs-checks, the worktree and the commit of the candidate: run the checks there, then call it again with checks.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId, ticketId, message, checks }, context) => {
    if (ticketId === undefined) {
      if (message !== undefined)
        throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, 'Only the merge of a ticket takes a message');
      return mergeTask(taskId, checks, context);
    }
    if (checks !== undefined)
      throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, 'Only the merge of a task takes checks');
    if (message === undefined)
      throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, 'The merge of a ticket needs a message');
    return mergeTicket(taskId, ticketId, message, context);
  },
};

/**
 * Returns the work of the ticket `ticketId` of the task `taskId` after it landed on the task branch as one commit with
 * the message `message`, with the services of `context`, and sets the ticket `needs-review`. A merge that stopped at
 * any step finishes when it is called again. A ticket that needs review, whose commit is on the task branch, returns
 * that commit again, and changes nothing.
 */
const mergeTicket = async (
  taskId: number,
  ticketId: number,
  message: string,
  context: MethodContext,
): Promise<TicketMergeResult> => {
  const { task, ticket } = await openTicket(taskId, ticketId, context.tasks);
  if (ticket.status === 'needs-review') {
    // A merge that ended returns its result again, since a caller whose call stopped cannot tell whether it ended.
    const changes = await worktreeCall(() => context.worktrees.ticketChanges(task, ticket, null));
    if (changes !== undefined) return { taskBranch: taskBranchOf(task), commit: changes.commit, ticket };
  }
  if (!isWorking(ticket.status))
    throw new RpcError(
      RPC_ERROR_CODES.INVALID_REQUEST,
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
 * Returns the work of the task `taskId` after its task branch landed on its base branch, with the checks `checks` of
 * a candidate and the services of `context`, and sets the task `done`. The merge holds every ticket of the task while
 * it runs.
 */
const mergeTask = async (
  taskId: number,
  checks: RebaseChecks | undefined,
  context: MethodContext,
): Promise<TaskMergeResult> => {
  const { tickets } = await findTask(taskId, context.tasks);
  const merge = async (): Promise<TaskMergeResult> => {
    // The task is read again under the claims, so a merge that ran in between is seen.
    const task = await findTask(taskId, context.tasks);
    // A merge that ended returns its result again, since a caller whose call stopped cannot tell whether it ended.
    if (task.status === 'done') return landedTask(task, context);
    const baseBranch = checkMergeable(task);
    const merged = await worktreeCall(() => context.worktrees.mergeTask(task, baseBranch, checks));
    await context.tasks.setStatus(taskId, 'done');
    return { ...merged, task: { ...task, status: 'done' } };
  };
  return endWork(
    taskId,
    tickets.map(({ id }) => id),
    merge,
    context,
  );
};

/**
 * Returns the result of the merge of the task `task`, which is done, again, with the services of `context`: the tip of
 * its landing on its base branch, or `null` when it cannot be found any more, and nothing deleted. Moves no branch. A
 * task without a base branch fails with an invalid request.
 */
const landedTask = async (task: Task, context: MethodContext): Promise<TaskMergeResult> => {
  const baseBranch = baseBranchOf(task);
  const commit = await worktreeCall(() => context.worktrees.taskLanding(task, baseBranch));
  return { baseBranch, commit: commit ?? null, deleted: NOTHING_DELETED, task };
};

/**
 * Returns the base branch of `task`, whose task branch can land on it. A task that is not complete, has a ticket that
 * is not done, or has no base branch fails with an invalid request.
 */
const checkMergeable = (task: Task): string => {
  checkComplete(task);
  const open = task.tickets.filter(({ status }) => status !== 'done').map(({ id }) => id);
  if (open.length > 0)
    throw new RpcError(
      RPC_ERROR_CODES.INVALID_REQUEST,
      `${plural(open.length, 'Ticket', 'Tickets')} ${open.join(', ')} of task ${task.id} ${plural(open.length, 'is', 'are')} not done, so the task branch cannot land`,
    );
  return baseBranchOf(task);
};

/**
 * Returns the base branch of `task`. A task without a base branch fails with an invalid request.
 */
const baseBranchOf = (task: Task): string => {
  if (task.baseBranch === null)
    throw new RpcError(
      RPC_ERROR_CODES.INVALID_REQUEST,
      `Task ${task.id} has no base branch to land its task branch on`,
    );
  return task.baseBranch;
};
