import type { Layout } from './worktree-layout.ts';
import type { WorktreesDependencies } from './worktrees.ts';

/**
 * Adapters and places that every operation on the worktrees of one repository uses.
 */
export interface WorktreesContext extends WorktreesDependencies {
  /**
   * Places of the worktrees of the repository.
   */
  readonly layout: Layout;

  /**
   * Platform that the paths belong to.
   */
  readonly platform: NodeJS.Platform;
}
