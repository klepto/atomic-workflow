import { z } from 'zod';
import { GOAL_SOURCES, type Task } from '../storage/task-store.ts';
import { taskGetMethod } from './method.task-get.ts';
import type { Method } from './method.ts';
import { openTask } from './open-task.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';

/**
 * Schema of the parameters of `goalSave`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task'),
  goalId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Number of the goal to edit within the task, counted from 1, a new goal when left out'),
  summary: z
    .string()
    .trim()
    .min(1)
    .regex(/^[^\r\n]*$/, 'Must be one line')
    .describe('Summary of the goal, on one line'),
  details: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Further information and comments on the goal, none when left out'),
  source: z
    .enum(GOAL_SOURCES)
    .optional()
    .describe('Who a new goal came from: user, or agent for an accepted suggestion. Required for a new goal only'),
});

/**
 * `Method` named `goalSave`, which adds a goal to a task that is not complete, or replaces the text of one of its
 * goals, and returns the task. An edited goal keeps its source. A task that does not exist, a goal that the task does
 * not have, and a new goal without a source fail with invalid parameters. A complete task fails with an invalid
 * request.
 */
export const goalSaveMethod: Method<typeof PARAMS, Task> = {
  name: 'goalSave',
  description:
    'Adds a goal that the user approved to a task of the atomic workflow, or edits one of its goals, and returns the task.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId, goalId, summary, details = null, source }, context) => {
    await openTask(taskId, context);
    if (goalId === undefined) {
      if (source === undefined) throw new RpcError(RpcErrorCode.INVALID_PARAMS, 'A new goal needs a source');
      await context.tasks.addGoal(taskId, { summary, details, source });
    } else if (!(await context.tasks.editGoal(taskId, goalId, { summary, details })))
      throw new RpcError(RpcErrorCode.INVALID_PARAMS, `Task ${taskId} has no goal ${goalId}`);
    return taskGetMethod.handle({ task: taskId }, context);
  },
};
