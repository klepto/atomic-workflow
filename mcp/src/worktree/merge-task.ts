import { branchExists, checkBranchExists, checkEverLanded, land, missingBranch, taskBranches } from './branches.ts';
import {
  applyChecks,
  continueCandidate,
  failedCheck,
  needsChecks,
  noCandidate,
  waitingCandidate,
} from './candidate.ts';
import { removeWorktrees, taskWorktrees } from './delete-worktrees.ts';
import { findTaskLanding } from './find-task-landing.ts';
import { samePath } from './paths.ts';
import { MERGE_AGAIN, stoppedRebase } from './rebase.ts';
import { rebaseOntoBase } from './sync-task-branch.ts';
import { WorktreeError } from './worktree-error.ts';
import { taskDirectory, taskPlaceOf } from './worktree-layout.ts';
import { checkClean } from './worktree-state.ts';
import type { MergedTask, RebaseChecks, WorkName, WorktreePlace } from './worktrees.ts';
import type { WorktreesContext } from './worktrees-context.ts';

/**
 * Returns the work of the task `task` in the repository of `context` after its task branch landed on the base branch
 * `baseBranch`, with the checks `checks` of the candidate of an earlier call, and every worktree and branch of the task
 * was removed, as `Worktrees.mergeTask` says.
 * Rejects as `Worktrees.mergeTask` says.
 */
export const mergeTask = async (
  task: WorkName,
  baseBranch: string,
  checks: RebaseChecks | undefined,
  context: WorktreesContext,
): Promise<MergedTask> => {
  const place = taskPlaceOf(context.layout, task);
  await checkBranchExists(baseBranch, context);
  if (!(await branchExists(place.branch, context))) {
    const landing = await findTaskLanding(task, baseBranch, context);
    if (landing === undefined) throw missingBranch(place.branch);
    return finishRemoval(task, baseBranch, landing, context);
  }
  const branches = await taskBranches(task, context);
  // A merge that stopped once the task branch moved to its candidate left the ticket branches behind its old tip.
  await checkEverLanded(
    branches.filter((branch) => branch !== place.branch),
    place.branch,
    context,
  );
  const worktrees = await taskWorktrees(task, branches, context);
  const isTaskWorktree = (path: string): boolean => samePath(path, place.path, context.platform);
  const detached = worktrees.some((worktree) => isTaskWorktree(worktree.path) && worktree.branch === undefined);
  const rebase = detached ? await stoppedRebase(place.path, context) : undefined;
  for (const worktree of worktrees) {
    if (rebase === undefined || !isTaskWorktree(worktree.path)) await checkClean(worktree.path, context);
  }
  if (rebase !== undefined) {
    if (checks !== undefined) throw noCandidate(place, checks.commit);
    await continueCandidate(place, baseBranch, rebase, MERGE_AGAIN, context);
  }
  await settleCandidate(place, baseBranch, checks, context);
  // A task branch that the base branch holds already, such as after a merge that stopped once the base branch moved,
  // lands nothing, and its landing is the latest commit of the task.
  const commit =
    (await land(baseBranch, place, context)) ?? (await findTaskLanding(task, place.branch, context)) ?? null;
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

/**
 * Brings the task branch of `place` in the repository of `context` onto the base branch `baseBranch`, so the base
 * branch can move forward to it. Without `checks`, a task branch that must be rebased is rebased into a candidate,
 * unless a candidate waits for its checks. With `checks` that passed, the task branch moves to its candidate. A
 * candidate whose branches moved while the checks ran is dropped, and the task branch is rebased again into a new
 * candidate.
 * Rejects with `needs-checks` for a candidate that waits for its checks. If a check of `checks` failed, drops the
 * candidate and rejects with `not-allowed`. Else rejects as `applyChecks` of `candidate.ts` and `rebaseOntoBase` do.
 */
const settleCandidate = async (
  place: WorktreePlace,
  baseBranch: string,
  checks: RebaseChecks | undefined,
  context: WorktreesContext,
): Promise<void> => {
  if (checks === undefined) {
    const waiting = await waitingCandidate(place, baseBranch, context);
    if (waiting !== undefined) throw needsChecks(place, baseBranch, waiting, MERGE_AGAIN);
    await rebaseOntoBase(place, baseBranch, MERGE_AGAIN, context);
    return;
  }
  const outcome = await applyChecks(place, baseBranch, checks, context);
  if (outcome === 'moved') await rebaseOntoBase(place, baseBranch, MERGE_AGAIN, context);
  else if (outcome !== 'passed') {
    const message = failedCheck(outcome, checks.commit, `neither ${place.branch} nor ${baseBranch} moved`);
    throw new WorktreeError('not-allowed', message);
  }
};

/**
 * Returns the work of the task `task` in the repository of `context` whose task branch is gone, while the base branch
 * `baseBranch` holds its commits up to `landing`, once the worktrees, branches and directory of the task that are left
 * were removed, such as after a merge that stopped during its removal.
 */
const finishRemoval = async (
  task: WorkName,
  baseBranch: string,
  landing: string,
  context: WorktreesContext,
): Promise<MergedTask> => {
  // The call that removed the task branch checked each ticket branch before the task branch moved, and removes the
  // task branch only after them, so a ticket branch that is left holds only landed work.
  const branches = await taskBranches(task, context);
  const deleted = await removeWorktrees(
    task,
    await taskWorktrees(task, branches, context),
    branches,
    [taskDirectory(context.layout, task)],
    context,
  );
  return { baseBranch, commit: landing, deleted };
};
