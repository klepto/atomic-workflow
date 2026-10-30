import { z } from 'zod';
import type { Task } from '../storage/task-store.ts';
import { findTask } from './find-task.ts';
import type { Method } from './method.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';
import { openTask } from './task-guards.ts';

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
  handle: async ({ taskId, goalId }, { tasks }) => {
    await openTask(taskId, tasks);
    if (!(await tasks.deleteGoal(taskId, goalId)))
      throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, `Task ${taskId} has no goal ${goalId}`);
    return findTask(taskId, tasks);
  },
};
