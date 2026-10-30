import type { Task, TaskStore, Ticket } from '../storage/task-store.ts';
import { findTask } from './find-task.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

/**
 * Task whose plan is complete, with one of its tickets.
 */
interface OpenTicket {
  /**
   * Task of the ticket.
   */
  readonly task: Task;

  /**
   * Ticket of the task.
   */
  readonly ticket: Ticket;
}

/**
 * Returns the task `taskId` of `tasks`, whose whole plan can still change. A task that does not exist fails with
 * invalid parameters. A complete or done task fails with an invalid request. Rejects as `tasks` does.
 */
export const openTask = async (taskId: number, tasks: TaskStore): Promise<Task> => {
  const task = await openAmendableTask(taskId, tasks);
  if (task.status === 'complete')
    throw new RpcError(
      RPC_ERROR_CODES.INVALID_REQUEST,
      `The plan of task ${taskId} is complete, so only its design and the tickets whose work has not started can change`,
    );
  return task;
};

/**
 * Returns the task `taskId` of `tasks`, whose design and tickets can still change: a task that is not done. A task
 * that does not exist fails with invalid parameters. A done task fails with an invalid request. Rejects as `tasks`
 * does.
 */
export const openAmendableTask = async (taskId: number, tasks: TaskStore): Promise<Task> => {
  const task = await findTask(taskId, tasks);
  if (task.status === 'done')
    throw new RpcError(RPC_ERROR_CODES.INVALID_REQUEST, `Task ${taskId} is done, so its plan cannot change`);
  return task;
};

/**
 * Returns the task `taskId` of `tasks`, whose plan is complete. A task that does not exist fails with invalid
 * parameters. A task whose plan is not complete, and a task that is done, fail with an invalid request. Rejects as
 * `tasks` does.
 */
export const openCompleteTask = async (taskId: number, tasks: TaskStore): Promise<Task> => {
  const task = await findTask(taskId, tasks);
  checkComplete(task);
  return task;
};

/**
 * Returns the ticket `ticketId` of the task `taskId` of `tasks`, whose plan is complete, with its task. A task or a
 * ticket that does not exist fails with invalid parameters. A task whose plan is not complete, and a task that is done,
 * fail with an invalid request. Rejects as `tasks` does.
 */
export const openTicket = async (taskId: number, ticketId: number, tasks: TaskStore): Promise<OpenTicket> => {
  const task = await openCompleteTask(taskId, tasks);
  return { task, ticket: ticketOf(task, ticketId) };
};

/**
 * Checks that the plan of `task` is complete. A task that is done, and a task whose plan is not complete, fail with an
 * invalid request.
 */
export const checkComplete = (task: Task): void => {
  if (task.status === 'done')
    throw new RpcError(RPC_ERROR_CODES.INVALID_REQUEST, `Task ${task.id} is done, and its branch landed already`);
  if (task.status !== 'complete') throw notCompleteError(task);
};

/**
 * Returns the failure of a call that needs the plan of `task` to be complete, while it is not.
 */
export const notCompleteError = (task: Task): RpcError =>
  new RpcError(RPC_ERROR_CODES.INVALID_REQUEST, `The plan of task ${task.id} is not complete. Complete it first`);

/**
 * Returns the ticket `ticketId` of `task`. A ticket that does not exist fails with invalid parameters.
 */
export const ticketOf = (task: Task, ticketId: number): Ticket => {
  const ticket = task.tickets.find(({ id }) => id === ticketId);
  if (ticket === undefined)
    throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, `Task ${task.id} has no ticket ${ticketId}`);
  return ticket;
};
