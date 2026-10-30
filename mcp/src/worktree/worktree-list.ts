import { resolve } from 'node:path';
import { forwardSlashes } from './paths.ts';
import { gitOutput, type RunGitFunction } from './run-git.ts';
import { BRANCH_REF_PREFIX } from './worktree-layout.ts';

/**
 * Start of the line that names the path of a worktree in the list of worktrees that git prints for scripts.
 */
const WORKTREE_LINE = 'worktree ';

/**
 * Start of the line that names the branch of a worktree in the list of worktrees that git prints for scripts.
 */
const BRANCH_LINE = `branch ${BRANCH_REF_PREFIX}`;

/**
 * Worktree that git knows.
 */
export interface ListedWorktree {
  /**
   * Absolute path of the worktree.
   */
  readonly path: string;

  /**
   * Name of the branch that the worktree has checked out, without `refs/heads/`, or `undefined` when it has none
   * checked out.
   */
  readonly branch: string | undefined;
}

/**
 * Returns every worktree of the repository that holds `directory`, the main worktree first, as git run with `runGit`
 * lists them.
 * If git fails, rejects with the error of `gitFailure`.
 */
export const listWorktrees = async (directory: string, runGit: RunGitFunction): Promise<ListedWorktree[]> =>
  parseWorktreeList(await gitOutput(directory, ['worktree', 'list', '--porcelain'], runGit));

/**
 * Returns the absolute path of the main worktree of the repository that holds `directory`, the checkout that every
 * other worktree of the repository was added from, as git run with `runGit` lists it. Every worktree of the repository
 * gives the same path.
 * If `directory` is not in a repository, or git lists no worktree, rejects.
 */
export const findMainWorktree = async (directory: string, runGit: RunGitFunction): Promise<string> => {
  const [first] = await listWorktrees(directory, runGit);
  if (first === undefined) throw new Error(`Git listed no worktree for ${forwardSlashes(directory)}`);
  return first.path;
};

/**
 * Returns the worktrees of the output `stdout` of `git worktree list --porcelain`, in its order.
 */
const parseWorktreeList = (stdout: string): ListedWorktree[] =>
  stdout
    .split(/\r?\n\r?\n/)
    .map((block) => block.split(/\r?\n/))
    .filter((lines) => lines[0]?.startsWith(WORKTREE_LINE))
    .map((lines) => ({
      path: resolve(lines[0].slice(WORKTREE_LINE.length)),
      branch: lines.find((line) => line.startsWith(BRANCH_LINE))?.slice(BRANCH_LINE.length),
    }));
