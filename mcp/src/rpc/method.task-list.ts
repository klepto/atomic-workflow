import { z } from 'zod';
import type { TaskSummary } from '../storage/task-store.ts';
import type { Method } from './method.ts';

/**
 * Schema of the parameters of `taskList`, which has none.
 */
const PARAMS = z.object({});

/**
 * `Method` named `taskList`, which returns every task of the repository without its plan, in the order of their
 * identifiers.
 */
export const taskListMethod: Method<typeof PARAMS, { readonly tasks: readonly TaskSummary[] }> = {
  name: 'taskList',
  description:
    'Returns every task of the atomic workflow with its slug, its status, its creation time and its number of completed tickets, whose work landed, and its total number of tickets.',
  agent: true,
  params: PARAMS,
  handle: async (_params, { tasks }) => ({ tasks: await tasks.list() }),
};
