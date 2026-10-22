import { z } from 'zod';
import type { DeletedWorktrees } from '../worktree/worktrees.ts';
import type { Method } from './method.ts';
import { TASK_REFERENCE, taskGetMethod } from './method.task-get.ts';
import { endWork, worktreeCall } from './open-ticket.ts';

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
}

/**
 * `Method` named `taskDelete`, which removes every worktree and branch of the task that `task` names, the task branch
 * included, then deletes the task with its goals and its tickets, and returns the identifier and the slug of the
 * deleted task with what it removed. Without `force`, a branch whose commits have not landed, on the task branch for a
 * ticket branch and on the base branch for the task branch, or a worktree with uncommitted changes, fails the call
 * with an invalid request, and nothing is deleted. A worktree or branch that cannot be removed, such as a directory
 * that another program holds, stays with a warning, and the task is deleted anyway. A task that does not exist fails
 * with invalid parameters, and so does a slug that several tasks have, with a message that lists each of them as
 * `<id>-<slug>`. A task with a ticket that another session holds fails with an invalid request.
 */
export const taskDeleteMethod: Method<typeof PARAMS, TaskDeleteResult> = {
  name: 'taskDelete',
  description:
    'Deletes a task of the atomic workflow with its goals, its design, its tickets, and its worktrees and branches, for good. Refuses to lose work that has not landed unless forced.',
  agent: true,
  params: PARAMS,
  handle: async ({ task: reference, force }, context) => {
    const task = await taskGetMethod.handle({ task: reference }, context);
    const taskId = task.id;
    const ticketIds = task.tickets.map(({ id }) => id);
    return endWork(taskId, ticketIds, context, async () => {
      const worktrees = await worktreeCall(() => context.worktrees.deleteTask(task, task.baseBranch, force));
      await context.tasks.delete(taskId);
      return { taskId, slug: task.slug, worktrees };
    });
  },
};
