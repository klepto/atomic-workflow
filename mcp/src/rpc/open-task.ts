import type { Task } from '../storage/task-store.ts';
import { taskGetMethod } from './method.task-get.ts';
import type { MethodContext } from './method.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';

/**
 * Returns the task `taskId`, whose plan can still change, with the services of `context`. A task that does not exist
 * fails with invalid parameters. A complete task fails with an invalid request.
 */
export const openTask = async (taskId: number, context: MethodContext): Promise<Task> => {
  const task = await taskGetMethod.handle({ taskId }, context);
  if (task.status === 'complete')
    throw new RpcError(RpcErrorCode.INVALID_REQUEST, `The plan of task ${taskId} is complete`);
  return task;
};
