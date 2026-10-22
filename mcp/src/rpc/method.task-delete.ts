import { z } from 'zod';
import type { Method } from './method.ts';
import { taskGetMethod } from './method.task-get.ts';

/**
 * Schema of the parameters of `taskDelete`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task'),
});

/**
 * `Method` named `taskDelete`, which deletes a task with its goals and its tickets, and returns the identifier and the
 * slug of the deleted task. A task that does not exist fails with invalid parameters.
 */
export const taskDeleteMethod: Method<typeof PARAMS, { readonly taskId: number; readonly slug: string }> = {
  name: 'taskDelete',
  description: 'Deletes a task of the atomic workflow with its goals, its design and its tickets, for good.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId }, context) => {
    const { slug } = await taskGetMethod.handle({ taskId }, context);
    await context.tasks.delete(taskId);
    return { taskId, slug };
  },
};
