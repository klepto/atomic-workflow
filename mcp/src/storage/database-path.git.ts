import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { DatabasePathFunction } from './database-path.ts';

/**
 * `execFile` of Node.js as a function that returns a promise.
 */
const execFileAsync = promisify(execFile);

/**
 * Path of the database file, relative to the main worktree.
 */
const DATABASE_FILE = join('.agents', 'atomic-workflow', 'database', 'database.db');

/**
 * Prefix of the line of `git worktree list --porcelain` that names a worktree.
 */
const WORKTREE_PREFIX = 'worktree ';

/**
 * `DatabasePathFunction` that takes the main worktree from `git worktree list`, which always lists it first.
 */
export const gitDatabasePath: DatabasePathFunction = async (directory) => {
  const commandLine = ['worktree', 'list', '--porcelain'];
  const { stdout } = await execFileAsync('git', commandLine, { cwd: directory, windowsHide: true });
  const [firstLine = ''] = stdout.split('\n');
  if (!firstLine.startsWith(WORKTREE_PREFIX)) throw new Error(`Git listed no worktree for ${directory}`);
  return join(resolve(firstLine.slice(WORKTREE_PREFIX.length).trimEnd()), DATABASE_FILE);
};
