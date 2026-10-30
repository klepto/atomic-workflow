import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import { comparablePath, forwardSlashes } from './paths.ts';
import type { WorkName, WorktreePlace } from './worktrees.ts';

/**
 * Start of the name of every branch of a task.
 */
const BRANCH_PREFIX = 'atomic-workflow/';

/**
 * Last part of the name of a task branch, and name of the directory of its worktree.
 */
const TASK_BRANCH_NAME = 'main';

/**
 * Start of the name of the reference that holds the fork point of a ticket branch. The name of the branch without
 * `BRANCH_PREFIX` ends it.
 */
const FORK_POINT_PREFIX = 'refs/atomic-workflow/fork-points/';

/**
 * Path, relative to the home of the user, of the directory that holds the directory of each repository.
 */
const WORKTREES_DIRECTORY = join('.atomic-workflow', 'worktrees');

/**
 * Number of the hex digits of the key that tells the directories of two repositories with the same name apart.
 */
const REPOSITORY_KEY_LENGTH = 8;

/**
 * Start of the name of the reference of a branch.
 */
export const BRANCH_REF_PREFIX = 'refs/heads/';

/**
 * Places of the worktrees of one repository.
 */
export interface Layout {
  /**
   * Absolute path of the main checkout, which git lists first among the worktrees.
   */
  readonly checkout: string;

  /**
   * Absolute path of the directory that holds the directory of each task of the repository.
   */
  readonly root: string;
}

/**
 * Returns the places of the worktrees of the repository whose main checkout is `checkout`, in the directory
 * `.atomic-workflow/worktrees/<name of the main checkout>-<hash of its path>/` of the home `home` of the user. Paths
 * that differ only in their separators, or on the platform `platform` `win32` only in their case, give the same hash.
 */
export const layoutOf = (checkout: string, home: string, platform: NodeJS.Platform): Layout => {
  const key = createHash('sha256').update(comparablePath(checkout, platform)).digest('hex');
  return {
    checkout,
    root: join(home, WORKTREES_DIRECTORY, `${basename(checkout)}-${key.slice(0, REPOSITORY_KEY_LENGTH)}`),
  };
};

/**
 * Returns the name of the reference of the branch `branch`.
 */
export const branchRef = (branch: string): string => `${BRANCH_REF_PREFIX}${branch}`;

/**
 * Returns the name of the directory of the task `task`, which also starts the names of its branches.
 */
const taskName = (task: WorkName): string => `${task.id}-${task.slug}`;

/**
 * Returns the directory of the task `task` in `layout`, which holds the worktrees of the task.
 */
export const taskDirectory = (layout: Layout, task: WorkName): string => join(layout.root, taskName(task));

/**
 * Returns the name of the task branch of the task `task`.
 */
export const taskBranchOf = (task: WorkName): string => `${BRANCH_PREFIX}${taskName(task)}/${TASK_BRANCH_NAME}`;

/**
 * Returns the start of the reference of every branch of the task `task`, which ends in `/`.
 */
export const taskBranchesRef = (task: WorkName): string => branchRef(`${BRANCH_PREFIX}${taskName(task)}/`);

/**
 * Returns the worktree and the branch of the task `task` in `layout`.
 */
export const taskPlaceOf = (layout: Layout, task: WorkName): WorktreePlace => ({
  path: join(taskDirectory(layout, task), TASK_BRANCH_NAME),
  branch: taskBranchOf(task),
});

/**
 * Returns the worktree and the branch of the ticket `ticket` of the task `task` in `layout`.
 */
export const ticketPlaceOf = (layout: Layout, task: WorkName, ticket: WorkName): WorktreePlace => ({
  path: join(taskDirectory(layout, task), `${ticket.id}-${ticket.slug}`),
  branch: `${BRANCH_PREFIX}${taskName(task)}/${ticket.id}-${ticket.slug}`,
});

/**
 * Returns `place` with its path in forward slashes.
 */
export const shown = (place: WorktreePlace): WorktreePlace => ({ ...place, path: forwardSlashes(place.path) });

/**
 * Returns the name of the reference that holds the fork point of the ticket branch `branch`.
 */
export const forkPointRefOf = (branch: string): string => `${FORK_POINT_PREFIX}${branch.slice(BRANCH_PREFIX.length)}`;
