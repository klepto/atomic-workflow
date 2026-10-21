import { z } from 'zod';
import type { Task } from '../storage/task-store.ts';
import { taskGetMethod } from './method.task-get.ts';
import type { Method } from './method.ts';
import { openTask } from './open-task.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';

/**
 * Schema of the parameters of `goalDelete`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task'),
  goalId: z
    .number()
    .int()
    .positive()
    .describe('Number of the goal to delete within the task, counted from 1. Each later goal moves down by one'),
});

/**
 * `Method` named `goalDelete`, which deletes a goal of a task that is not complete, and returns the task. A task that
 * does not exist and a goal that the task does not have fail with invalid parameters. A complete task fails with an
 * invalid request.
 */
export const goalDeleteMethod: Method<typeof PARAMS, Task> = {
  name: 'goalDelete',
  description: 'Deletes a goal of a task of the atomic workflow, and returns the task.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId, goalId }, context) => {
    await openTask(taskId, context);
    if (!(await context.tasks.deleteGoal(taskId, goalId)))
      throw new RpcError(RpcErrorCode.INVALID_PARAMS, `Task ${taskId} has no goal ${goalId}`);
    return taskGetMethod.handle({ taskId }, context);
  },
};
