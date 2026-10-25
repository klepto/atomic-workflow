import { basename } from 'node:path';
import { z } from 'zod';
import type { Method } from './method.ts';

/**
 * Schema of the parameters of `repositoryGet`, which has none.
 */
const PARAMS = z.object({});

/**
 * Main worktree of the repository, with its name.
 */
interface RepositoryGetResult {
  /**
   * Name of the repository: the last segment of `directory`, such as `atomic-workflow-mcp`.
   */
  readonly name: string;

  /**
   * Absolute path of the main worktree of the repository.
   */
  readonly directory: string;
}

/**
 * `Method` named `repositoryGet`, which returns the main worktree of the repository and its name. It only reads.
 */
export const repositoryGetMethod: Method<typeof PARAMS, RepositoryGetResult> = {
  name: 'repositoryGet',
  description:
    'Returns the repository of the atomic workflow: the absolute path of its main worktree, and its name, the last segment of that path.',
  agent: false,
  params: PARAMS,
  handle: async (_params, { mainWorktree }) => ({ name: basename(mainWorktree), directory: mainWorktree }),
};
