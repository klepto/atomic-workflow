import { dirname } from 'node:path';
import { hasCandidate } from './candidate.ts';
import { type CopyFailures, copyIgnoredFiles } from './copy-ignored.ts';
import { forwardSlashes, samePath } from './paths.ts';
import { isRebasing, stoppedRebase } from './rebase.ts';
import { gitOutput, lastLines, QUOTED_LINE_COUNT } from './run-git.ts';
import { WorktreeError } from './worktree-error.ts';
import { listWorktrees } from './worktree-list.ts';
import type { WorktreePlace } from './worktrees.ts';
import type { WorktreesContext } from './worktrees-context.ts';

/**
 * Makes the worktree of `place` in the repository of `context`, with `copy` a copy of the ignored files of the main
 * checkout, unless it exists, and returns the files that could not be copied. If the worktree exists, nothing was
 * copied, or every copy succeeded, returns `undefined` instead. A worktree whose stopped rebase rewrites the branch of
 * `place`, and so detaches it from the branch, counts as a worktree of the branch, and so does a worktree with a
 * detached `HEAD` while the branch of `place` has a candidate.
 * If the path of `place` holds a worktree of another branch, the branch of `place` is checked out in another
 * worktree, or git refuses to make the worktree, rejects with `not-allowed`.
 */
export const ensureWorktree = async (
  place: WorktreePlace,
  copy: boolean,
  context: WorktreesContext,
): Promise<CopyFailures | undefined> => {
  const { checkout } = context.layout;
  const listed = await listWorktrees(checkout, context.runGit);
  const existing = listed.find((worktree) => samePath(worktree.path, place.path, context.platform));
  if (existing !== undefined) {
    if ((existing.branch ?? (await detachedBranch(place, context))) === place.branch) return undefined;
    throw new WorktreeError(
      'not-allowed',
      `The worktree ${forwardSlashes(place.path)} has ${existing.branch ?? 'no branch'} checked out in place of ${place.branch}. Check out ${place.branch} there, then try again`,
    );
  }
  const holder = listed.find((worktree) => worktree.branch === place.branch);
  if (holder !== undefined) {
    throw new WorktreeError(
      'not-allowed',
      `The branch ${place.branch} is checked out in ${forwardSlashes(holder.path)}. Check out another branch there, then try again`,
    );
  }
  await context.fileSystem.makeDirectory(dirname(place.path));
  const output = await context.runGit(checkout, ['worktree', 'add', '--quiet', place.path, place.branch]);
  if (output.exitCode !== 0) {
    throw new WorktreeError(
      'not-allowed',
      `Git refused to make the worktree ${forwardSlashes(place.path)} of ${place.branch}: ${lastLines(output)}`,
    );
  }
  return copy ? copyIgnoredFiles(checkout, place.path, context) : undefined;
};

/**
 * Rejects with `not-allowed` when git knows no worktree of the branch of `place` at its path in the repository of
 * `context`. A worktree at the path with no branch checked out counts while it has a stopped rebase, which detaches it
 * from its branch.
 */
export const checkListed = async (place: WorktreePlace, context: WorktreesContext): Promise<void> => {
  const listed = (await listWorktrees(context.layout.checkout, context.runGit)).find((worktree) =>
    samePath(worktree.path, place.path, context.platform),
  );
  if (listed?.branch === place.branch) return;
  if (listed !== undefined && listed.branch === undefined && (await isRebasing(place.path, context))) return;
  throw new WorktreeError(
    'not-allowed',
    `No worktree of ${place.branch} exists at ${forwardSlashes(place.path)}. Create the worktree of the ticket first`,
  );
};

/**
 * Rejects with `not-allowed` when the worktree of the task branch of `place` in the repository of `context` has a
 * stopped rebase, which detaches it from the task branch, so the task branch cannot move.
 */
export const checkNotRebasing = async (place: WorktreePlace, context: WorktreesContext): Promise<void> => {
  if (!(await context.fileSystem.exists(place.path)) || !(await isRebasing(place.path, context))) return;
  throw new WorktreeError(
    'not-allowed',
    `The worktree ${forwardSlashes(place.path)} of the task branch ${place.branch} has a stopped rebase, so the task branch cannot move. Resolve the conflicting files there, run git add on them there, and create the worktree of a ticket again, which ends the rebase. Then merge again`,
  );
};

/**
 * Rejects with `not-allowed` when the worktree `path` in the repository of `context` has changes that no commit
 * holds: changes of tracked files, and files that are neither tracked nor ignored.
 */
export const checkClean = async (path: string, context: WorktreesContext): Promise<void> => {
  const lines = await changes(path, true, context);
  if (lines.length === 0) return;
  throw new WorktreeError(
    'not-allowed',
    `The worktree ${forwardSlashes(path)} has changes that no commit holds: ${lines.slice(0, QUOTED_LINE_COUNT).join(', ')}. Commit or discard them, then try again`,
  );
};

/**
 * Returns one line of `git status --porcelain` per changed file of the worktree `path` in the repository of
 * `context`: changes of tracked files, and with `untracked`, files that are neither tracked nor ignored.
 * If git fails, rejects with the error of `gitFailure`.
 */
export const changes = async (path: string, untracked: boolean, context: WorktreesContext): Promise<string[]> => {
  const option = untracked ? '--untracked-files=all' : '--untracked-files=no';
  const stdout = await gitOutput(path, ['status', '--porcelain', option], context.runGit);
  return stdout.split('\n').filter((line) => line.trim() !== '');
};

/**
 * Returns whether the index of the worktree `path` in the repository of `context` differs from its `HEAD`.
 */
export const hasStagedChanges = async (path: string, context: WorktreesContext): Promise<boolean> => {
  const output = await context.runGit(path, ['diff', '--cached', '--quiet']);
  return output.exitCode !== 0;
};

/**
 * Returns the branch that the worktree of `place` in the repository of `context`, which has no branch checked out,
 * works on: the branch that its stopped rebase rewrites, or the branch of `place` while it has a candidate. Else
 * returns `undefined`.
 */
const detachedBranch = async (place: WorktreePlace, context: WorktreesContext): Promise<string | undefined> => {
  const rebase = await stoppedRebase(place.path, context);
  if (rebase?.branch !== undefined) return rebase.branch;
  return (await hasCandidate(place.branch, context)) ? place.branch : undefined;
};
