import type { Task } from '../storage/task-store.ts';
import { taskGetMethod } from './method.task-get.ts';
import type { MethodContext } from './method.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';

/**
 * Returns the task `taskId`, whose whole plan can still change, with the services of `context`. A task that does not
 * exist fails with invalid parameters. A complete or done task fails with an invalid request.
 */
export const openTask = async (taskId: number, context: MethodContext): Promise<Task> => {
  const task = await openAmendableTask(taskId, context);
  if (task.status === 'complete')
    throw new RpcError(
      RpcErrorCode.INVALID_REQUEST,
      `The plan of task ${taskId} is complete, so only its design and the tickets whose work has not started can change`,
    );
  return task;
};

/**
 * Returns the task `taskId`, whose design and tickets can still change, with the services of `context`: a task that
 * is not done. A task that does not exist fails with invalid parameters. A done task fails with an invalid request.
 */
export const openAmendableTask = async (taskId: number, context: MethodContext): Promise<Task> => {
  const task = await taskGetMethod.handle({ task: taskId }, context);
  if (task.status === 'done')
    throw new RpcError(RpcErrorCode.INVALID_REQUEST, `Task ${taskId} is done, so its plan cannot change`);
  return task;
};
