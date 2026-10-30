import { join } from 'node:path';

/**
 * Path of the database file, relative to the main worktree.
 */
const DATABASE_FILE = join('.agents', 'atomic-workflow', 'database', 'database.db');

/**
 * Returns the absolute path of the database file of the repository whose main worktree is at the absolute path
 * `mainWorktree`. The file sits in the main worktree, under `.agents/atomic-workflow/database/`, so every worktree of
 * the repository shares it.
 */
export const databasePath = (mainWorktree: string): string => join(mainWorktree, DATABASE_FILE);
