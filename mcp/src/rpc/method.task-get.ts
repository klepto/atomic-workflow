import { z } from 'zod';
import type { Task } from '../storage/task-store.ts';
import type { Method } from './method.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';

/**
 * Schema of the parameters of `taskGet`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task'),
});

/**
 * `Method` named `taskGet`, which returns a task with its plan: its goals, its design and its tickets. A task that does not exist fails with invalid
 * parameters.
 */
export const taskGetMethod: Method<typeof PARAMS, Task> = {
  name: 'taskGet',
  description: 'Returns a task of the atomic workflow with its status, its goals, its design and its tickets.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId }, { tasks }) => {
    const task = await tasks.get(taskId);
    if (task === undefined) throw new RpcError(RpcErrorCode.INVALID_PARAMS, `No task ${taskId} exists`);
    return task;
  },
};
