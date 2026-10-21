import { z } from 'zod';
import type { Task } from '../storage/task-store.ts';
import { taskGetMethod } from './method.task-get.ts';
import type { Method } from './method.ts';
import { openTask } from './open-task.ts';

/**
 * Schema of the parameters of `designSave`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task'),
  design: z.string().trim().min(1).describe('Whole design of the task in Markdown, which replaces the stored one'),
});

/**
 * `Method` named `designSave`, which replaces the design of a task that is not complete, and returns the task. A task
 * that does not exist fails with invalid parameters. A complete task fails with an invalid request.
 */
export const designSaveMethod: Method<typeof PARAMS, Task> = {
  name: 'designSave',
  description:
    'Replaces the design of a task of the atomic workflow with a whole new draft of it, and returns the task.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId, design }, context) => {
    await openTask(taskId, context);
    await context.tasks.setDesign(taskId, design);
    return taskGetMethod.handle({ taskId }, context);
  },
};
