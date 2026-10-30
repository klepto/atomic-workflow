import { z } from 'zod';
import type { Task } from '../storage/task-store.ts';
import { findTask, TASK_REFERENCE } from './find-task.ts';
import type { Method } from './method.ts';

/**
 * Schema of the parameters of `taskGet`.
 */
const PARAMS = z.object({
  task: TASK_REFERENCE,
});

/**
 * `Method` named `taskGet`, which returns the task that `task` names, with its plan: its goals, its design and its
 * tickets. A task that does not exist fails with invalid parameters, and so does a slug that several tasks have, with a
 * message that lists each of them as `<id>-<slug>`.
 */
export const taskGetMethod: Method<typeof PARAMS, Task> = {
  name: 'taskGet',
  description:
    'Returns a task of the atomic workflow, named by its id, its slug or both as <id>-<slug>, with its status, its goals, its design and its tickets.',
  agent: true,
  params: PARAMS,
  handle: async ({ task }, { tasks }) => findTask(task, tasks),
};
