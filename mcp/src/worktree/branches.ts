import { gitFailure, gitOutput, lastLines } from './run-git.ts';
import { WorktreeError } from './worktree-error.ts';
import { branchRef, forkPointRefOf, taskBranchesRef } from './worktree-layout.ts';
import { listWorktrees } from './worktree-list.ts';
import type { WorkName, WorktreePlace } from './worktrees.ts';
import type { WorktreesContext } from './worktrees-context.ts';

/**
 * Returns whether the branch `branch` exists in the repository of `context`.
 */
export const branchExists = async (branch: string, context: WorktreesContext): Promise<boolean> => {
  const output = await context.runGit(context.layout.checkout, ['rev-parse', '--verify', '--quiet', branchRef(branch)]);
  return output.exitCode === 0;
};

/**
 * Returns the id of the commit that the revision `revision` names, such as `HEAD` or the reference of a branch, read
 * in the worktree `directory` of the repository of `context`.
 * If git fails, rejects with the error of `gitFailure`.
 */
export const commitOf = async (directory: string, revision: string, context: WorktreesContext): Promise<string> =>
  gitOutput(directory, ['rev-parse', revision], context.runGit);

/**
 * Returns whether the commit `ancestor` is `descendant` or one of its ancestors, read in the worktree `directory` of
 * the repository of `context`. A commit that does not exist is no ancestor.
 */
export const isAncestor = async (
  directory: string,
  ancestor: string,
  descendant: string,
  context: WorktreesContext,
): Promise<boolean> => {
  const output = await context.runGit(directory, ['merge-base', '--is-ancestor', ancestor, descendant]);
  return output.exitCode === 0;
};

/**
 * Returns the names of every branch of the task `task` in the repository of `context`, the task branch included.
 * If git fails, rejects with the error of `gitFailure`.
 */
export const taskBranches = async (task: WorkName, context: WorktreesContext): Promise<string[]> => {
  const commandLine = ['for-each-ref', '--format=%(refname:short)', taskBranchesRef(task)];
  const stdout = await gitOutput(context.layout.checkout, commandLine, context.runGit);
  return stdout.split('\n').filter((line) => line !== '');
};

/**
 * Makes the branch `branch` at `start` in the repository of `context`.
 * If git refuses, rejects with `not-allowed`.
 */
export const makeBranch = async (branch: string, start: string, context: WorktreesContext): Promise<void> => {
  const output = await context.runGit(context.layout.checkout, ['branch', '--no-track', branch, start]);
  if (output.exitCode === 0) return;
  throw new WorktreeError('not-allowed', `Git refused to make the branch ${branch} at ${start}: ${lastLines(output)}`);
};

/**
 * Returns the fork point of the ticket branch `branch`, read in the worktree `directory` of the repository of
 * `context`: the commit of the task branch that its own commits start from. For a branch without a fork point, such
 * as one made before fork points were recorded, returns `undefined` instead.
 */
export const forkPointOf = async (
  directory: string,
  branch: string,
  context: WorktreesContext,
): Promise<string | undefined> => {
  const commandLine = ['rev-parse', '--verify', '--quiet', `${forkPointRefOf(branch)}^{commit}`];
  const output = await context.runGit(directory, commandLine);
  return output.exitCode === 0 ? output.stdout.trim() : undefined;
};

/**
 * Records the commit `commit` as the fork point of the ticket branch `branch`, in the worktree `directory` of the
 * repository of `context`.
 * If git fails, rejects with the error of `gitFailure`.
 */
export const setForkPoint = async (
  directory: string,
  branch: string,
  commit: string,
  context: WorktreesContext,
): Promise<void> => {
  await gitOutput(directory, ['update-ref', forkPointRefOf(branch), commit], context.runGit);
};

/**
 * Moves the branch `target` forward to the tip of the branch of `place` in the repository of `context`, and returns
 * the tip. A branch of `place` that `target` holds already lands nothing, and returns `null`.
 * If the branch of `place` does not hold the tip of `target`, or `target` cannot move, rejects with `not-allowed`.
 */
export const land = async (target: string, place: WorktreePlace, context: WorktreesContext): Promise<string | null> => {
  const { checkout } = context.layout;
  const targetTip = await commitOf(checkout, branchRef(target), context);
  const tip = await commitOf(checkout, branchRef(place.branch), context);
  if (await isAncestor(checkout, tip, targetTip, context)) return null;
  if (!(await isAncestor(checkout, targetTip, tip, context))) {
    throw new WorktreeError(
      'not-allowed',
      `The branch ${place.branch} does not hold the tip of ${target}, so ${target} cannot move to it. Merge again`,
    );
  }
  await forwardBranch(target, targetTip, tip, context);
  return tip;
};

/**
 * Moves the branch `branch` of the repository of `context` forward from `oldCommit` to `newCommit`: in the worktree
 * that has it checked out, so its files follow, or as a plain reference when no worktree has it checked out.
 * If git refuses, such as for changes of the worktree that the move would overwrite, rejects with `not-allowed`.
 */
export const forwardBranch = async (
  branch: string,
  oldCommit: string,
  newCommit: string,
  context: WorktreesContext,
): Promise<void> => {
  const { checkout } = context.layout;
  const holder = (await listWorktrees(checkout, context.runGit)).find((worktree) => worktree.branch === branch);
  const output =
    holder === undefined
      ? await context.runGit(checkout, ['update-ref', branchRef(branch), newCommit, oldCommit])
      : await context.runGit(holder.path, ['merge', '--ff-only', '--quiet', newCommit]);
  if (output.exitCode === 0) return;
  throw new WorktreeError(
    'not-allowed',
    `Git refused to move ${branch} forward to ${newCommit}: ${lastLines(output)}. Remove the cause, then merge again`,
  );
};

/**
 * Rejects with `not-allowed` when the branch `branch` does not exist in the repository of `context`.
 */
export const checkBranchExists = async (branch: string, context: WorktreesContext): Promise<void> => {
  if (await branchExists(branch, context)) return;
  throw missingBranch(branch);
};

/**
 * Returns the refusal `not-allowed` for the branch `branch`, which does not exist, so the task branch cannot land.
 */
export const missingBranch = (branch: string): WorktreeError =>
  new WorktreeError('not-allowed', `The branch ${branch} does not exist, so the task branch cannot land`);

/**
 * Rejects with `not-allowed` when a branch of `branches` holds commits that the branch `target` lacks in the
 * repository of `context`, or `target` does not exist while `branches` is not empty.
 */
export const checkLanded = async (
  branches: readonly string[],
  target: string,
  context: WorktreesContext,
): Promise<void> => {
  const lacking: string[] = [];
  for (const branch of branches) {
    const landed = await isAncestor(context.layout.checkout, branchRef(branch), branchRef(target), context);
    if (!landed) lacking.push(branch);
  }
  if (lacking.length > 0) throw notLanded(lacking, target);
};

/**
 * Rejects with `not-allowed` when a branch of `branches` holds commits that neither the branch `target` nor an earlier
 * tip of it in its reflog holds, in the repository of `context`. A branch whose commits landed on `target` before a
 * rebase rewrote them, such as a ticket branch once the task branch moved to its candidate, counts as landed.
 * If git fails, rejects with the error of `gitFailure`.
 */
export const checkEverLanded = async (
  branches: readonly string[],
  target: string,
  context: WorktreesContext,
): Promise<void> => {
  const { checkout } = context.layout;
  // A branch without a reflog, such as with core.logAllRefUpdates off, has only its tip to compare with.
  const reflog = await context.runGit(checkout, ['reflog', 'show', '--format=%H', branchRef(target)]);
  const tips = reflog.exitCode === 0 ? reflog.stdout.trim() : '';
  const commandLine = ['rev-list', '--max-count=1', '--stdin'];
  const lacking: string[] = [];
  for (const branch of branches) {
    const input = `${branchRef(branch)}\n--not\n${branchRef(target)}\n${tips}\n`;
    const output = await context.runGit(checkout, commandLine, input);
    if (output.exitCode !== 0) throw gitFailure(checkout, commandLine, output);
    if (output.stdout.trim() !== '') lacking.push(branch);
  }
  if (lacking.length > 0) throw notLanded(lacking, target);
};

/**
 * Returns the refusal `not-allowed` for the branches `lacking`, which hold commits that the branch `target` lacks.
 */
const notLanded = (lacking: readonly string[], target: string): WorktreeError =>
  new WorktreeError(
    'not-allowed',
    `The branches ${lacking.join(', ')} hold commits that ${target} lacks, so their work would be lost. Merge them first, or delete them with force`,
  );

/**
 * Rejects with `not-allowed` when the task branch `taskBranch`, one of `branches`, holds commits that the base branch
 * `baseBranch` lacks in the repository of `context`, or the base branch is `null` or does not exist.
 */
export const checkTaskLanded = async (
  branches: readonly string[],
  taskBranch: string,
  baseBranch: string | null,
  context: WorktreesContext,
): Promise<void> => {
  if (!branches.includes(taskBranch)) return;
  if (baseBranch !== null && (await branchExists(baseBranch, context))) {
    await checkLanded([taskBranch], baseBranch, context);
    return;
  }
  throw new WorktreeError(
    'not-allowed',
    `The task branch ${taskBranch} has no base branch to compare it with, so its work may be lost. Delete it with force to delete it anyway`,
  );
};
