import { z } from 'zod';
import type { Task } from '../storage/task-store.ts';
import { findTask } from './find-task.ts';
import type { Method } from './method.ts';

/**
 * Schema of the parameters of `taskRunStart`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task whose unattended run starts'),
});

/**
 * `Method` named `taskRunStart`, which starts the run of the task `taskId` now, and returns the task. A run that was
 * active already restarts from now. The run ends once the connection of the caller closes, unless it ended or another
 * run started before. A task that does not exist fails with invalid parameters.
 */
export const taskRunStartMethod: Method<typeof PARAMS, Task> = {
  name: 'taskRunStart',
  description:
    'Marks the start of an unattended run of a task of the atomic workflow, for the run timer of the web app, and returns the task.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId }, { tasks, caller, clock }) => {
    await findTask(taskId, tasks);
    const startedAt = clock.now();
    await tasks.startRun(taskId, startedAt);
    // A failed end leaves the run active until the next start of the server ends it.
    if (caller !== undefined)
      void caller.closed.then(() => tasks.endRun(taskId, clock.now(), startedAt)).catch(() => undefined);
    return findTask(taskId, tasks);
  },
};
