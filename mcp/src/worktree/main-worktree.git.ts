import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { MainWorktreeFunction } from './main-worktree.ts';

/**
 * `execFile` of Node.js as a function that returns a promise.
 */
const execFileAsync = promisify(execFile);

/**
 * Prefix of the line of `git worktree list --porcelain` that names a worktree.
 */
const WORKTREE_PREFIX = 'worktree ';

/**
 * `MainWorktreeFunction` that takes the main worktree from `git worktree list`, which always lists it first.
 */
export const gitMainWorktree: MainWorktreeFunction = async (directory) => {
  const commandLine = ['worktree', 'list', '--porcelain'];
  const { stdout } = await execFileAsync('git', commandLine, { cwd: directory, windowsHide: true });
  const [firstLine = ''] = stdout.split('\n');
  if (!firstLine.startsWith(WORKTREE_PREFIX)) throw new Error(`Git listed no worktree for ${directory}`);
  return resolve(firstLine.slice(WORKTREE_PREFIX.length).trimEnd());
};
