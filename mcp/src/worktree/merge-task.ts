import { checkBranchExists, checkLanded, land, taskBranches } from './branches.ts';
import { removeWorktrees, taskWorktrees } from './delete-worktrees.ts';
import { samePath } from './paths.ts';
import { continueRebase, isRebasing, MERGE_AGAIN } from './rebase.ts';
import { rebaseOntoBase } from './sync-task-branch.ts';
import { taskDirectory, taskPlaceOf } from './worktree-layout.ts';
import { checkClean } from './worktree-state.ts';
import type { MergedTask, WorkName } from './worktrees.ts';
import type { WorktreesContext } from './worktrees-context.ts';

/**
 * Returns the work of the task `task` in the repository of `context` after its task branch landed on the base branch
 * `baseBranch`, and every worktree and branch of the task was removed, as `Worktrees.mergeTask` says.
 * Rejects as `Worktrees.mergeTask` says.
 */
export const mergeTask = async (task: WorkName, baseBranch: string, context: WorktreesContext): Promise<MergedTask> => {
  const place = taskPlaceOf(context.layout, task);
  for (const branch of [place.branch, baseBranch]) await checkBranchExists(branch, context);
  const branches = await taskBranches(task, context);
  await checkLanded(
    branches.filter((branch) => branch !== place.branch),
    place.branch,
    context,
  );
  const worktrees = await taskWorktrees(task, branches, context);
  const rebasing =
    worktrees.some(
      (worktree) => samePath(worktree.path, place.path, context.platform) && worktree.branch === undefined,
    ) && (await isRebasing(place.path, context));
  for (const worktree of worktrees) {
    if (!rebasing || !samePath(worktree.path, place.path, context.platform)) await checkClean(worktree.path, context);
  }
  if (rebasing) await continueRebase(place, baseBranch, MERGE_AGAIN, context);
  else await rebaseOntoBase(place, baseBranch, MERGE_AGAIN, context);
  const commit = await land(baseBranch, place, context);
  // The ticket branches held no commit that the task branch lacked before its rebase, so their removal loses nothing.
  const deleted = await removeWorktrees(
    task,
    await taskWorktrees(task, branches, context),
    branches,
    [taskDirectory(context.layout, task)],
    context,
  );
  return { baseBranch, commit, deleted };
};
