import { branchExists, checkLanded, checkTaskLanded, taskBranches } from './branches.ts';
import { removeCandidate } from './candidate.ts';
import { errorMessage } from './error-details.ts';
import { forwardSlashes, isBelow, samePath } from './paths.ts';
import { lastLines } from './run-git.ts';
import { WorktreeError } from './worktree-error.ts';
import { forkPointRefOf, taskBranchOf, taskDirectory, ticketPlaceOf } from './worktree-layout.ts';
import { type ListedWorktree, listWorktrees } from './worktree-list.ts';
import { checkClean } from './worktree-state.ts';
import type { DeletedWorktrees, WorkName } from './worktrees.ts';
import type { WorktreesContext } from './worktrees-context.ts';

/**
 * Number of the characters of the command line of a stopped process that its line in `DeletedWorktrees` shows.
 */
const SHOWN_COMMAND_LINE_LENGTH = 160;

/**
 * Processes that a removal stopped before it removed their directories.
 */
interface StoppedHolders {
  /**
   * One line for each process that stopped, with its identifier and the start of its command line.
   */
  readonly stoppedProcesses: readonly string[];

  /**
   * One sentence for each process that did not stop.
   */
  readonly warnings: readonly string[];
}

/**
 * Returns what the removal of the worktree and the branch of the ticket `ticket` of the task `task` in the repository
 * of `context` removed, as `Worktrees.deleteTicket` says.
 * Rejects as `Worktrees.deleteTicket` says.
 */
export const deleteTicketWorktree = async (
  task: WorkName,
  ticket: WorkName,
  force: boolean,
  context: WorktreesContext,
): Promise<DeletedWorktrees> => {
  const place = ticketPlaceOf(context.layout, task, ticket);
  const worktrees = await removableWorktrees(
    [place.branch],
    (worktree) => samePath(worktree.path, place.path, context.platform) || worktree.branch === place.branch,
    context,
  );
  const branches = (await branchExists(place.branch, context)) ? [place.branch] : [];
  if (!force) {
    await checkLanded(branches, taskBranchOf(task), context);
    for (const worktree of worktrees) await checkClean(worktree.path, context);
  }
  return removeWorktrees(task, worktrees, branches, [], context);
};

/**
 * Returns what the removal of every worktree and branch of the task `task` in the repository of `context` removed, as
 * `Worktrees.deleteTask` says.
 * Rejects as `Worktrees.deleteTask` says.
 */
export const deleteTaskWorktrees = async (
  task: WorkName,
  baseBranch: string | null,
  force: boolean,
  context: WorktreesContext,
): Promise<DeletedWorktrees> => {
  const taskBranch = taskBranchOf(task);
  const branches = await taskBranches(task, context);
  const worktrees = await taskWorktrees(task, branches, context);
  if (!force) {
    await checkTaskLanded(branches, taskBranch, baseBranch, context);
    await checkLanded(
      branches.filter((branch) => branch !== taskBranch),
      taskBranch,
      context,
    );
    for (const worktree of worktrees) await checkClean(worktree.path, context);
  }
  return removeWorktrees(task, worktrees, branches, [taskDirectory(context.layout, task)], context);
};

/**
 * Returns every worktree of the task `task` in the repository of `context`: the ones in the directory of the task, and
 * the ones that have one of its branches `branches` checked out. The main checkout is never one of them.
 * If the main checkout has one of `branches` checked out, rejects with `not-allowed`. If git fails, rejects with the
 * error of `gitFailure`.
 */
export const taskWorktrees = async (
  task: WorkName,
  branches: readonly string[],
  context: WorktreesContext,
): Promise<ListedWorktree[]> => {
  const directory = taskDirectory(context.layout, task);
  return removableWorktrees(
    branches,
    (worktree) => isBelow(directory, worktree.path, context.platform) || branches.includes(worktree.branch ?? ''),
    context,
  );
};

/**
 * Returns the worktrees of the repository of `context` that `isSelected` selects, without the main checkout, which a
 * removal never touches.
 * If the main checkout has one of the branches `branches` checked out, rejects with `not-allowed`, since the removal
 * of that branch needs it checked out elsewhere. If git fails, rejects with the error of `gitFailure`.
 */
const removableWorktrees = async (
  branches: readonly string[],
  isSelected: (worktree: ListedWorktree) => boolean,
  context: WorktreesContext,
): Promise<ListedWorktree[]> => {
  const { checkout } = context.layout;
  const listed = await listWorktrees(checkout, context.runGit);
  const isCheckout = (worktree: ListedWorktree): boolean => samePath(worktree.path, checkout, context.platform);
  const held = listed.find((worktree) => isCheckout(worktree) && branches.includes(worktree.branch ?? ''));
  if (held !== undefined) {
    throw new WorktreeError(
      'not-allowed',
      `The main checkout ${forwardSlashes(checkout)} has the branch ${held.branch} checked out. Check out another branch there, then try again`,
    );
  }
  return listed.filter((worktree) => !isCheckout(worktree) && isSelected(worktree));
};

/**
 * Returns what the removal of the worktrees `worktrees` of the task `task`, the branches `branches` with their fork
 * points, and then the directories `directories` of the repository of `context` removed, with a warning for each one
 * that could not be removed. The processes that run from the worktrees and the directories are stopped first. A
 * worktree outside the directory of the task is removed by git only, never deleted as a directory.
 */
export const removeWorktrees = async (
  task: WorkName,
  worktrees: readonly ListedWorktree[],
  branches: readonly string[],
  directories: readonly string[],
  context: WorktreesContext,
): Promise<DeletedWorktrees> => {
  const paths = [...worktrees.map(({ path }) => path), ...directories];
  const stopped = await stopHolders(paths, context);
  const warnings = [...stopped.warnings];
  const removedWorktrees: string[] = [];
  for (const worktree of worktrees) {
    if (await removeWorktree(task, worktree.path, warnings, context))
      removedWorktrees.push(forwardSlashes(worktree.path));
  }
  // A prune that fails leaves only stale entries of removed worktrees, which the next prune drops.
  await context.runGit(context.layout.checkout, ['worktree', 'prune']);
  const removedBranches: string[] = [];
  for (const branch of branches) {
    if (await removeBranch(branch, warnings, context)) removedBranches.push(branch);
  }
  for (const directory of directories) await removeDirectory(directory, warnings, context);
  return {
    worktrees: removedWorktrees,
    branches: removedBranches,
    stoppedProcesses: stopped.stoppedProcesses,
    warnings,
  };
};

/**
 * Stops the processes that run from the paths `paths` that exist, with the stop of `context`, and returns one line
 * for each process that stopped, and one warning for each one that did not. Paths that do not exist stop nothing, and
 * start no search.
 */
const stopHolders = async (paths: readonly string[], context: WorktreesContext): Promise<StoppedHolders> => {
  const existing: string[] = [];
  for (const path of paths) if (await context.fileSystem.exists(path)) existing.push(path);
  if (existing.length === 0) return { stoppedProcesses: [], warnings: [] };
  const { stopped, failures } = await context.stopProcesses(existing);
  return {
    stoppedProcesses: stopped.map(({ pid, commandLine }) => `${pid} ${shortened(commandLine)}`),
    warnings: failures,
  };
};

/**
 * Returns `commandLine` cut to `SHOWN_COMMAND_LINE_LENGTH` characters, with `…` at the end when it was cut.
 */
const shortened = (commandLine: string): string =>
  commandLine.length <= SHOWN_COMMAND_LINE_LENGTH ? commandLine : `${commandLine.slice(0, SHOWN_COMMAND_LINE_LENGTH)}…`;

/**
 * Deletes the branch `branch` of the repository of `context` with its fork point and its candidate, and returns
 * whether the branch is gone. A failure adds a warning to `warnings`.
 */
const removeBranch = async (branch: string, warnings: string[], context: WorktreesContext): Promise<boolean> => {
  const { checkout } = context.layout;
  const output = await context.runGit(checkout, ['branch', '--quiet', '-D', branch]);
  if (output.exitCode !== 0) {
    warnings.push(`The branch ${branch} could not be deleted: ${lastLines(output)}`);
    return false;
  }
  const forkPoint = await context.runGit(checkout, ['update-ref', '-d', forkPointRefOf(branch)]);
  if (forkPoint.exitCode !== 0) {
    warnings.push(`The fork point of the branch ${branch} could not be deleted: ${lastLines(forkPoint)}`);
  }
  const candidate = await removeCandidate(branch, context);
  if (candidate.exitCode !== 0) {
    warnings.push(`The candidate of the branch ${branch} could not be deleted: ${lastLines(candidate)}`);
  }
  return true;
};

/**
 * Removes the worktree `path` of the task `task` in the repository of `context` with its files, and returns whether it
 * is gone. A directory that git cannot remove, such as one that another program holds for a moment, is deleted with
 * retries, but only below the directory of the task. A failure adds a warning to `warnings`.
 */
const removeWorktree = async (
  task: WorkName,
  path: string,
  warnings: string[],
  context: WorktreesContext,
): Promise<boolean> => {
  const output = await context.runGit(context.layout.checkout, ['worktree', 'remove', '--force', '--force', path]);
  if (output.exitCode === 0 && !(await context.fileSystem.exists(path))) return true;
  if (!isInsideTask(task, path, context)) {
    const reason = output.exitCode === 0 ? 'its directory stayed' : lastLines(output);
    warnings.push(`The worktree ${forwardSlashes(path)} could not be removed: ${reason}`);
    return false;
  }
  return removeDirectory(path, warnings, context);
};

/**
 * Returns whether `path` lies below the directory of the task `task` in the repository of `context`, and is not that
 * directory itself.
 */
const isInsideTask = (task: WorkName, path: string, context: WorktreesContext): boolean => {
  const directory = taskDirectory(context.layout, task);
  return isBelow(directory, path, context.platform) && !samePath(directory, path, context.platform);
};

/**
 * Deletes the directory `path` with its contents, and returns whether it is gone. A directory that does not exist is
 * gone. A failure adds a warning to `warnings`.
 */
const removeDirectory = async (path: string, warnings: string[], context: WorktreesContext): Promise<boolean> => {
  try {
    await context.fileSystem.removeDirectory(path);
    return true;
  } catch (error) {
    warnings.push(`The directory ${forwardSlashes(path)} could not be deleted: ${errorMessage(error)}`);
    return false;
  }
};
