import { branchExists } from './branches.ts';
import { TASK_TRAILER } from './merge-ticket.ts';
import { gitOutput } from './run-git.ts';
import { branchRef } from './worktree-layout.ts';
import type { WorkName } from './worktrees.ts';
import type { WorktreesContext } from './worktrees-context.ts';

/**
 * Returns the tip of the landing of the task `task` on the branch `branch` in the repository of `context`: the latest
 * commit whose trailer names the task. If the branch does not exist or holds no such commit, returns `undefined`
 * instead.
 * If git fails, rejects with the error of `gitFailure`.
 */
export const findTaskLanding = async (
  task: WorkName,
  branch: string,
  context: WorktreesContext,
): Promise<string | undefined> => {
  if (!(await branchExists(branch, context))) return undefined;
  const search = [
    'log',
    '-1',
    '--format=%H',
    // The pattern matches a whole line, so task 1 does not match the trailer of task 11.
    `--grep=^${TASK_TRAILER}: ${task.id}-${task.slug}$`,
    branchRef(branch),
  ];
  const commit = await gitOutput(context.layout.checkout, search, context.runGit);
  return commit === '' ? undefined : commit;
};
