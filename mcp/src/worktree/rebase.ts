import { join } from 'node:path';
import { forwardSlashes } from './paths.ts';
import { type GitOutput, gitFailure, gitOutput, lastLines } from './run-git.ts';
import { WorktreeError } from './worktree-error.ts';
import { BRANCH_REF_PREFIX } from './worktree-layout.ts';
import type { WorktreePlace } from './worktrees.ts';
import type { WorktreesContext } from './worktrees-context.ts';

/**
 * Options of each git command that commits or rebases, so no hook of the repository runs for the work of the server.
 */
export const NO_HOOKS: readonly string[] = ['-c', 'core.hooksPath=/dev/null'];

/**
 * Options of each rebase that starts, so the settings of the user change no rebase.
 */
const REBASE_OPTIONS: readonly string[] = ['--no-autosquash', '--no-autostash', '--no-update-refs'];

/**
 * Names of the directories where git keeps a stopped rebase, in the order git looks for them.
 */
const REBASE_DIRECTORIES: readonly string[] = ['rebase-merge', 'rebase-apply'];

/**
 * What a conflict of a merge of a ticket or of a task asks the caller to do once the files are resolved.
 */
export const MERGE_AGAIN = 'merge again';

/**
 * What a conflict of the sync of a task branch asks the caller to do once the files are resolved.
 */
export const CREATE_AGAIN = 'create the worktree of the ticket again';

/**
 * Rebase that stopped in a worktree.
 */
export interface StoppedRebase {
  /**
   * Name of the branch that the rebase rewrites, without `refs/heads/`, or `undefined` for a rebase of a detached
   * `HEAD`.
   */
  readonly branch: string | undefined;

  /**
   * Commit that the rebase puts the commits onto.
   */
  readonly onto: string;
}

/**
 * Rebases the branch of `place` in its worktree with the arguments `revisions`, which name where the commits go and
 * which commits go, in the repository of `context`.
 * If the rebase onto the branch `target` stops, rejects as `checkRebaseEnded` does, with `retry`.
 */
export const startRebase = async (
  place: WorktreePlace,
  target: string,
  revisions: readonly string[],
  retry: string,
  context: WorktreesContext,
): Promise<void> => {
  const commandLine = [...NO_HOOKS, 'rebase', ...REBASE_OPTIONS, ...revisions];
  const output = await context.runGit(place.path, commandLine);
  await checkRebaseEnded(place, target, commandLine, output, retry, context);
};

/**
 * Lets the stopped rebase of the worktree of `place` onto the branch `target` go on once every conflicting file is
 * resolved and added. If it stops again, or a file still conflicts, rejects as `checkRebaseEnded` does, with `retry`.
 */
export const continueRebase = async (
  place: WorktreePlace,
  target: string,
  retry: string,
  context: WorktreesContext,
): Promise<void> => {
  const files = await conflictFiles(place.path, context);
  if (files.length > 0) throw conflict(place, target, files, retry);
  const commandLine = [...NO_HOOKS, 'rebase', '--continue'];
  const output = await context.runGit(place.path, commandLine);
  await checkRebaseEnded(place, target, commandLine, output, retry, context);
};

/**
 * Returns the stopped rebase of the worktree `path` in the repository of `context`, or `undefined` when it has none.
 * If the files of the stopped rebase cannot be read, rejects with the error of the read.
 */
export const stoppedRebase = async (path: string, context: WorktreesContext): Promise<StoppedRebase | undefined> => {
  const directory = await rebaseDirectory(path, context);
  if (directory === undefined) return undefined;
  const headName = (await context.fileSystem.readText(join(directory, 'head-name'))).trim();
  const onto = (await context.fileSystem.readText(join(directory, 'onto'))).trim();
  const branch = headName.startsWith(BRANCH_REF_PREFIX) ? headName.slice(BRANCH_REF_PREFIX.length) : undefined;
  return { branch, onto };
};

/**
 * Returns whether the worktree `path` in the repository of `context` has a stopped rebase.
 */
export const isRebasing = async (path: string, context: WorktreesContext): Promise<boolean> =>
  (await rebaseDirectory(path, context)) !== undefined;

/**
 * Returns the paths of the files in conflict in the worktree `path` in the repository of `context`.
 * If git fails, rejects with the error of `gitFailure`.
 */
export const conflictFiles = async (path: string, context: WorktreesContext): Promise<string[]> => {
  const stdout = await gitOutput(path, ['diff', '--name-only', '--diff-filter=U'], context.runGit);
  return stdout.split('\n').filter((line) => line !== '');
};

/**
 * Rejects when the rebase onto the branch `target` in the worktree of `place`, which ran as git with the arguments
 * `commandLine` and printed `output`, stopped: with `conflict` when files conflict, which asks the caller to `retry`
 * once they are resolved, else with `not-allowed`. A rebase that failed without a stop rejects with the error of
 * `gitFailure`.
 */
const checkRebaseEnded = async (
  place: WorktreePlace,
  target: string,
  commandLine: readonly string[],
  output: GitOutput,
  retry: string,
  context: WorktreesContext,
): Promise<void> => {
  if (await isRebasing(place.path, context)) {
    const files = await conflictFiles(place.path, context);
    if (files.length > 0) throw conflict(place, target, files, retry);
    throw new WorktreeError(
      'not-allowed',
      `Git stopped the rebase onto ${target} in ${forwardSlashes(place.path)}: ${lastLines(output)}. Run git status there to see what the rebase waits for`,
    );
  }
  if (output.exitCode !== 0) throw gitFailure(place.path, commandLine, output);
};

/**
 * Returns the `conflict` of the rebase onto the branch `target` in the worktree of `place` on the files `files`, which
 * asks the caller to `retry` once they are resolved.
 */
const conflict = (place: WorktreePlace, target: string, files: readonly string[], retry: string): WorktreeError =>
  new WorktreeError(
    'conflict',
    `The rebase of ${place.branch} onto ${target} stopped on a conflict in ${files.join(', ')}. Resolve the files in ${forwardSlashes(place.path)}, run git add on them there, then ${retry}`,
    files,
  );

/**
 * Returns the absolute path of the directory where git keeps the stopped rebase of the worktree `path` in the
 * repository of `context`, or `undefined` when it has none.
 */
const rebaseDirectory = async (path: string, context: WorktreesContext): Promise<string | undefined> => {
  for (const name of REBASE_DIRECTORIES) {
    const commandLine = ['rev-parse', '--path-format=absolute', '--git-path', name];
    const directory = await gitOutput(path, commandLine, context.runGit);
    if (await context.fileSystem.exists(directory)) return directory;
  }
  return undefined;
};
