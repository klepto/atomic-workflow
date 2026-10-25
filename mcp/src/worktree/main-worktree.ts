import { gitMainWorktree } from './main-worktree.git.ts';

/**
 * Function that returns the absolute path of the main worktree of the repository that holds `directory`, the checkout
 * that every other worktree of the repository was added from. Every worktree of the repository gives the same path.
 * If `directory` is not in a repository, rejects.
 */
export type MainWorktreeFunction = (directory: string) => Promise<string>;

/**
 * Default `MainWorktreeFunction`, which asks git for the worktrees of the repository.
 */
export const MainWorktree: MainWorktreeFunction = gitMainWorktree;
