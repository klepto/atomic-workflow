import { join } from 'node:path';
import { MainWorktree } from '../worktree/main-worktree.ts';
import type { DatabasePathFunction } from './database-path.ts';

/**
 * Path of the database file, relative to the main worktree.
 */
const DATABASE_FILE = join('.agents', 'atomic-workflow', 'database', 'database.db');

/**
 * `DatabasePathFunction` that puts the database file below the main worktree that `MainWorktree` finds.
 */
export const gitDatabasePath: DatabasePathFunction = async (directory) =>
  join(await MainWorktree(directory), DATABASE_FILE);
