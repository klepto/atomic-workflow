import { branchExists, commitOf, forkPointOf, forwardBranch, isAncestor, taskBranches } from './branches.ts';
import { forwardSlashes } from './paths.ts';
import {
  CREATE_AGAIN,
  conflictFiles,
  continueRebase,
  type StoppedRebase,
  startRebase,
  stoppedRebase,
} from './rebase.ts';
import { gitOutput } from './run-git.ts';
import { WorktreeError } from './worktree-error.ts';
import { branchRef, taskPlaceOf } from './worktree-layout.ts';
import { changes, ensureWorktree } from './worktree-state.ts';
import type { WorkName, WorktreePlace } from './worktrees.ts';
import type { WorktreesContext } from './worktrees-context.ts';

/**
 * Sync of a task branch with its base branch.
 */
interface TaskBranchSync {
  /**
   * Whether the task branch moved onto the tip of the base branch.
   */
  readonly synced: boolean;

  /**
   * One sentence for each cause that kept the task branch where it is.
   */
  readonly warnings: readonly string[];
}

/**
 * Sync that moved the task branch onto the tip of the base branch.
 */
const SYNCED: TaskBranchSync = { synced: true, warnings: [] };

/**
 * Sync that left the task branch as it is, with no warning.
 */
const NOT_SYNCED: TaskBranchSync = { synced: false, warnings: [] };

/**
 * Syncs the task branch of the task `task` in the repository of `context` with the base branch `baseBranch`, in the
 * worktree of the task, and returns whether it moved, with a warning for each cause that kept it where it is. A sync
 * that stopped continues as `resumeSync` says. Else, only with `start`, a new sync starts: a task branch that holds the
 * tip of the base branch stays as it is, one that the base branch holds moves forward to it, and any other is rebased
 * onto it. A new sync is skipped, with a warning, when the base branch does not exist, the worktree of the task has
 * changes that no commit holds, or a ticket branch of the task has no fork point, since the rebase would break its
 * squash.
 * If the rebase stops, rejects as `checkRebaseEnded` of `rebase.ts` does, and leaves it stopped in the worktree of the
 * task.
 */
export const syncTaskBranch = async (
  task: WorkName,
  baseBranch: string,
  start: boolean,
  context: WorktreesContext,
): Promise<TaskBranchSync> => {
  const { checkout } = context.layout;
  const place = taskPlaceOf(context.layout, task);
  const rebase = await stoppedRebase(place.path, context);
  if (rebase !== undefined) return resumeSync(place, baseBranch, rebase, start, context);
  if (!start) return NOT_SYNCED;
  if (!(await branchExists(baseBranch, context))) {
    return skippedSync(`The base branch ${baseBranch} does not exist`, baseBranch);
  }
  const baseRef = branchRef(baseBranch);
  const taskRef = branchRef(place.branch);
  if (await isAncestor(checkout, baseRef, taskRef, context)) return NOT_SYNCED;
  const cause = await syncBlocker(task, place, context);
  if (cause !== undefined) return skippedSync(cause, baseBranch);
  if (!(await isAncestor(checkout, taskRef, baseRef, context))) {
    await rebaseOntoBase(place, baseBranch, CREATE_AGAIN, context);
    return SYNCED;
  }
  const taskTip = await commitOf(checkout, taskRef, context);
  await forwardBranch(place.branch, taskTip, await commitOf(checkout, baseRef, context), context);
  return SYNCED;
};

/**
 * Rebases the task branch of `place` onto the tip of the base branch `baseBranch` in the worktree of `place` in the
 * repository of `context`, made without a copy of the ignored files where it does not exist. A task branch that holds
 * the tip of the base branch, or that the base branch holds, stays as it is.
 * If the worktree cannot be made, rejects as `ensureWorktree` does. If the rebase stops, rejects as
 * `checkRebaseEnded` of `rebase.ts` does, with `retry`.
 */
export const rebaseOntoBase = async (
  place: WorktreePlace,
  baseBranch: string,
  retry: string,
  context: WorktreesContext,
): Promise<void> => {
  const { checkout } = context.layout;
  const baseRef = branchRef(baseBranch);
  const taskRef = branchRef(place.branch);
  if (await isAncestor(checkout, baseRef, taskRef, context)) return;
  if (await isAncestor(checkout, taskRef, baseRef, context)) return;
  await gitOutput(checkout, ['worktree', 'prune'], context.runGit);
  await ensureWorktree(place, false, context);
  const baseTip = await commitOf(checkout, baseRef, context);
  await startRebase(place, baseBranch, [baseTip], retry, context);
};

/**
 * Returns the sync that the cause `cause` skipped, which left the task branch behind the base branch `baseBranch`.
 */
const skippedSync = (cause: string, baseBranch: string): TaskBranchSync => ({
  synced: false,
  warnings: [`${cause}, so the task branch was not synced with ${baseBranch}`],
});

/**
 * Continues the stopped rebase `rebase` in the worktree of the task branch of `place` in the repository of `context`,
 * a sync with the base branch `baseBranch`, once every conflicting file is resolved and added, and returns the sync
 * that it ends. Without `start`, a rebase that is no sync stays as it is, and so does a sync whose files still
 * conflict, with a warning.
 * With `start`, if `rebase` does not rebase the task branch onto a commit of the base branch, rejects with
 * `not-allowed`, and if a file still conflicts or the rebase stops again, rejects as `checkRebaseEnded` of `rebase.ts`
 * does.
 */
const resumeSync = async (
  place: WorktreePlace,
  baseBranch: string,
  rebase: StoppedRebase,
  start: boolean,
  context: WorktreesContext,
): Promise<TaskBranchSync> => {
  const sync =
    rebase.branch === place.branch &&
    (await isAncestor(context.layout.checkout, rebase.onto, branchRef(baseBranch), context));
  if (!sync && !start) return NOT_SYNCED;
  if (!sync) {
    throw new WorktreeError(
      'not-allowed',
      `The worktree ${forwardSlashes(place.path)} of the task branch has a stopped rebase that is no sync of ${place.branch} with ${baseBranch}. Finish or abort it there, then try again`,
    );
  }
  const files = await conflictFiles(place.path, context);
  if (!start && files.length > 0) {
    return skippedSync(
      `The sync in ${forwardSlashes(place.path)} stopped on a conflict in ${files.join(', ')}`,
      baseBranch,
    );
  }
  await continueRebase(place, baseBranch, CREATE_AGAIN, context);
  return SYNCED;
};

/**
 * Returns the cause that keeps the task branch of `place` of the task `task` in the repository of `context` from a
 * sync, or `undefined` when nothing does: changes of the worktree of the task that no commit holds, or ticket branches
 * without a fork point.
 */
const syncBlocker = async (
  task: WorkName,
  place: WorktreePlace,
  context: WorktreesContext,
): Promise<string | undefined> => {
  if ((await changes(place.path, true, context)).length > 0) {
    return `The worktree ${forwardSlashes(place.path)} of the task branch has changes that no commit holds`;
  }
  const unforked: string[] = [];
  for (const branch of await taskBranches(task, context)) {
    if (branch !== place.branch && (await forkPointOf(context.layout.checkout, branch, context)) === undefined) {
      unforked.push(branch);
    }
  }
  if (unforked.length === 0) return undefined;
  return `The ticket branches ${unforked.join(', ')} have no fork point, since they were made before fork points were recorded, and a rebase of the task branch would break their squash`;
};
