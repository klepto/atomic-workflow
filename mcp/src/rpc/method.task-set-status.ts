import { z } from 'zod';
import { TASK_STATUSES, type Task, type TaskStatus } from '../storage/task-store.ts';
import { taskGetMethod } from './method.task-get.ts';
import type { Method } from './method.ts';
import { openTask } from './open-task.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';

/**
 * Schema of the parameters of `taskSetStatus`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task'),
  status: z.enum(TASK_STATUSES).describe('Status to set: the stage of planning the user works on, or complete'),
});

/**
 * `Method` named `taskSetStatus`, which sets the status of a task, and returns the task. A status needs every part of the
 * plan before it: `plan-design` needs goals, `plan-tickets` a design too, and `complete` tickets too. A task that does
 * not exist fails with invalid parameters. A complete task, and a task that lacks a part of the plan, fail with an
 * invalid request.
 */
export const taskSetStatusMethod: Method<typeof PARAMS, Task> = {
  name: 'taskSetStatus',
  description:
    'Sets the status of a task of the atomic workflow to the stage of planning the user works on, or to complete once the user is satisfied with the whole plan, and returns the task.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId, status }, context) => {
    const task = await openTask(taskId, context);
    const missing = missingPart(task, status);
    if (missing !== undefined)
      throw new RpcError(RpcErrorCode.INVALID_REQUEST, `Task ${taskId} needs ${missing} for the status ${status}`);
    await context.tasks.setStatus(taskId, status);
    return taskGetMethod.handle({ taskId }, context);
  },
};

/**
 * Returns the first part of the plan that `task` lacks for the status `status`. If it lacks none, returns `undefined`
 * instead.
 */
const missingPart = (task: Task, status: TaskStatus): string | undefined => {
  const rank = TASK_STATUSES.indexOf(status);
  if (rank >= 1 && task.goals.length === 0) return 'goals';
  if (rank >= 2 && task.design === null) return 'a design';
  if (rank >= 3 && task.tickets.length === 0) return 'tickets';
  return undefined;
};
