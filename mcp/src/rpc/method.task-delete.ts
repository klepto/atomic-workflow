import { z } from 'zod';
import type { DeletedWorktrees } from '../worktree/worktrees.ts';
import { endWork } from './claim-tickets.ts';
import { stopDeletedSubagent } from './delete-subagent.ts';
import { findTask, TASK_REFERENCE } from './find-task.ts';
import type { Method, MethodContext } from './method.ts';
import { worktreeCall } from './worktree-call.ts';

/**
 * Schema of the parameters of `taskDelete`.
 */
const PARAMS = z.object({
  task: TASK_REFERENCE,
  force: z
    .boolean()
    .default(false)
    .describe(
      'Whether to delete the task also when its branches hold commits that have not landed, or its worktrees hold uncommitted changes, which are then lost',
    ),
});

/**
 * Result of `taskDelete`.
 */
interface TaskDeleteResult {
  /**
   * Identifier of the deleted task.
   */
  readonly taskId: number;

  /**
   * Slug of the deleted task.
   */
  readonly slug: string;

  /**
   * Worktrees and branches of the task that the deletion removed.
   */
  readonly worktrees: DeletedWorktrees;

  /**
   * Identifiers of the subagents of the task that the deletion removed with their messages.
   */
  readonly subagents: readonly string[];
}

/**
 * `Method` named `taskDelete`, which stops each started subagent that works on the task that `task` names, as
 * `stopDeletedSubagent` does, then removes every worktree and branch of the task, the task branch included, then
 * deletes the task with its goals and its tickets, and each subagent that works on it with its messages, and returns
 * the identifier and the slug of the deleted task with what it removed. Without `force`, a branch whose commits have
 * not landed, on the task branch for a ticket branch and on the base branch for the task branch, or a worktree with
 * uncommitted changes, fails the call with an invalid request, and nothing is deleted, though its subagents stay
 * stopped. A worktree or branch that cannot be removed, such as a directory that another program holds, stays with a
 * warning, and the task is deleted anyway. A task that does not exist fails with invalid parameters, and so does a slug
 * that several tasks have, with a message that lists each of them as `<id>-<slug>`. A task with a ticket that another
 * session holds fails with an invalid request, and stops nothing.
 */
export const taskDeleteMethod: Method<typeof PARAMS, TaskDeleteResult> = {
  name: 'taskDelete',
  description:
    'Deletes a task of the atomic workflow with its goals, its design, its tickets, and its worktrees and branches, for good. Refuses to lose work that has not landed unless forced.',
  agent: true,
  params: PARAMS,
  handle: async ({ task: reference, force }, context) => {
    const task = await findTask(reference, context.tasks);
    const taskId = task.id;
    const remove = async (): Promise<TaskDeleteResult> => {
      const subagents = await subagentIdsOfTask(taskId, context);
      // A subagent stops before its worktree goes, so that it does not work on in a removed directory.
      await Promise.all(subagents.map((id) => stopDeletedSubagent(id, context)));
      const worktrees = await worktreeCall(() => context.worktrees.deleteTask(task, task.baseBranch, force));
      await context.tasks.delete(taskId);
      for (const id of subagents) await context.sessions.delete(id);
      return { taskId, slug: task.slug, worktrees, subagents };
    };
    return endWork(
      taskId,
      task.tickets.map(({ id }) => id),
      remove,
      context,
    );
  },
};

/**
 * Returns the identifiers of the registered subagents that work on the task `taskId`, with the services of `context`,
 * started or not. Rejects as the session store of `context` does.
 */
const subagentIdsOfTask = async (taskId: number, context: MethodContext): Promise<readonly string[]> =>
  (await context.sessions.list())
    .filter((session) => session.role === 'subagent' && session.taskId === taskId)
    .map(({ id }) => id);
