import { z } from 'zod';
import type { Task } from '../storage/task-store.ts';
import { findTask } from './find-task.ts';
import type { Method } from './method.ts';
import { openAmendableTask } from './task-guards.ts';

/**
 * Schema of the parameters of `designSave`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task'),
  design: z.string().trim().min(1).describe('Whole design of the task in Markdown, which replaces the stored one'),
});

/**
 * `Method` named `designSave`, which replaces the design of a task that is not done, and returns the task. The design
 * of a complete task can change too, since it documents the result. A task that does not exist fails with invalid
 * parameters. A done task fails with an invalid request.
 */
export const designSaveMethod: Method<typeof PARAMS, Task> = {
  name: 'designSave',
  description:
    'Replaces the design of a task of the atomic workflow with a whole new draft of it, and returns the task. The design of a complete task can change too, until the task is done.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId, design }, { tasks }) => {
    await openAmendableTask(taskId, tasks);
    await tasks.setDesign(taskId, design);
    return findTask(taskId, tasks);
  },
};
