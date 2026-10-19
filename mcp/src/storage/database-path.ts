import { gitDatabasePath } from './database-path.git.ts';

/**
 * Function that returns the absolute path of the database file of the repository that holds `directory`. The file
 * sits in the main worktree, under `.agents/atomic-workflow/database/`, so every worktree of the repository gives the
 * same path.
 * If `directory` is not in a repository, rejects.
 */
export type DatabasePathFunction = (directory: string) => Promise<string>;

/**
 * Default `DatabasePathFunction`, which asks git for the main worktree.
 */
export const DatabasePath: DatabasePathFunction = gitDatabasePath;
