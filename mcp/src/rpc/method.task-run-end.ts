import { z } from 'zod';
import type { Task } from '../storage/task-store.ts';
import { findTask } from './find-task.ts';
import type { Method } from './method.ts';

/**
 * Schema of the parameters of `taskRunEnd`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task whose unattended run ends'),
});

/**
 * `Method` named `taskRunEnd`, which ends the active run of the task `taskId` now, and returns the task. A task without
 * an active run stays as it is. A task that does not exist fails with invalid parameters.
 */
export const taskRunEndMethod: Method<typeof PARAMS, Task> = {
  name: 'taskRunEnd',
  description:
    'Marks the end of the active unattended run of a task of the atomic workflow, for the run timer of the web app, and returns the task.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId }, { tasks, clock }) => {
    await findTask(taskId, tasks);
    await tasks.endRun(taskId, clock.now());
    return findTask(taskId, tasks);
  },
};
