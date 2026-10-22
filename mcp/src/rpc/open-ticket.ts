import type { ClaimHolder } from '../attachment/ticket-claims.ts';
import type { Task, Ticket, TicketStatus } from '../storage/task-store.ts';
import { WorktreeError } from '../worktree/worktree-error.ts';
import { taskGetMethod } from './method.task-get.ts';
import type { MethodContext } from './method.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';

/**
 * Task whose plan is complete, with one of its tickets.
 */
export interface OpenTicket {
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
 * Returns the ticket `ticketId` of the task `taskId`, whose plan is complete, with the services of `context`. A task
 * or a ticket that does not exist fails with invalid parameters. A task whose plan is not complete, and a task that is
 * done, fail with an invalid request.
 */
export const openTicket = async (taskId: number, ticketId: number, context: MethodContext): Promise<OpenTicket> => {
  const task = await openCompleteTask(taskId, context);
  const ticket = task.tickets.find(({ id }) => id === ticketId);
  if (ticket === undefined) throw new RpcError(RpcErrorCode.INVALID_PARAMS, `Task ${taskId} has no ticket ${ticketId}`);
  return { task, ticket };
};

/**
 * Returns the task `taskId`, whose plan is complete, with the services of `context`. A task that does not exist fails
 * with invalid parameters. A task whose plan is not complete, and a task that is done, fail with an invalid request.
 */
export const openCompleteTask = async (taskId: number, context: MethodContext): Promise<Task> => {
  const task = await taskGetMethod.handle({ task: taskId }, context);
  if (task.status === 'done')
    throw new RpcError(RpcErrorCode.INVALID_REQUEST, `Task ${taskId} is done, and its branch landed already`);
  if (task.status !== 'complete')
    throw new RpcError(RpcErrorCode.INVALID_REQUEST, `The plan of task ${taskId} is not complete. Complete it first`);
  return task;
};

/**
 * Returns whether the work of a ticket with the status `status` landed on the task branch: `needs-review` or `done`.
 */
export const hasLanded = (status: TicketStatus): boolean => status === 'needs-review' || status === 'done';

/**
 * Returns the ids of the tickets of `task` that `ticket` depends on and whose work has not landed, in the order of
 * `dependsOn`. A ticket can start only once this is empty.
 */
export const pendingDependencies = (task: Task, ticket: Ticket): number[] =>
  ticket.dependsOn.filter((id) => {
    const dependency = task.tickets.find((other) => other.id === id);
    return dependency === undefined || !hasLanded(dependency.status);
  });

/**
 * Returns the caller of `context` as the holder of claims that last until its connection closes, such as the claim of
 * a ticket that it starts. A caller without a connection fails with an invalid request.
 */
export const lastingHolder = (context: MethodContext): ClaimHolder => {
  if (context.caller !== undefined) return context.caller;
  throw new RpcError(
    RpcErrorCode.INVALID_REQUEST,
    'Only a client that is connected to the repository server can start the work on a ticket',
  );
};

/**
 * Returns the holder of the claims of one call of `context`: the connection of its caller, or for a caller without a
 * connection, a holder that never goes away, whose claims the call must release itself.
 */
export const callHolder = (context: MethodContext): ClaimHolder =>
  context.caller ?? { closed: new Promise<void>(() => undefined) };

/**
 * Claims each ticket of `ticketIds` of the task `taskId` for `holder`, and returns the ids of the ones that the call
 * claimed, which `holder` did not hold already. A ticket that another holder holds fails with an invalid request, and
 * leaves no new claim.
 */
export const claimTickets = (
  taskId: number,
  ticketIds: readonly number[],
  holder: ClaimHolder,
  context: MethodContext,
): number[] => {
  const held = ticketIds.filter((id) => context.ticketClaims.isHeldByOther(taskId, id, holder));
  if (held.length > 0)
    throw new RpcError(
      RpcErrorCode.INVALID_REQUEST,
      `${held.length === 1 ? 'Ticket' : 'Tickets'} ${held.join(', ')} of task ${taskId} ${held.length === 1 ? 'is' : 'are'} in progress in another session`,
    );
  // No await separates the check from the claims, so no other request claims a ticket in between.
  return ticketIds.filter((id) => context.ticketClaims.claim(taskId, id, holder) === 'claimed');
};

/**
 * Releases each ticket of `ticketIds` of the task `taskId` in the claims of `context`.
 */
export const releaseTickets = (taskId: number, ticketIds: readonly number[], context: MethodContext): void => {
  for (const id of ticketIds) context.ticketClaims.release(taskId, id);
};

/**
 * Returns the value of `operation`, which ends the work on each ticket of `ticketIds` of the task `taskId`. It runs
 * while the caller of `context` holds each of them, and releases every one of them after. A ticket that another
 * session holds fails with an invalid request, and `operation` does not run.
 */
export const endWork = async <Value>(
  taskId: number,
  ticketIds: readonly number[],
  context: MethodContext,
  operation: () => Promise<Value>,
): Promise<Value> => {
  claimTickets(taskId, ticketIds, callHolder(context), context);
  try {
    return await operation();
  } finally {
    releaseTickets(taskId, ticketIds, context);
  }
};

/**
 * Returns the value of the call on the worktrees `call`. A `WorktreeError` fails with an invalid request, whose data
 * holds its kind and its conflicting files.
 */
export const worktreeCall = async <Value>(call: () => Promise<Value>): Promise<Value> => {
  try {
    return await call();
  } catch (error) {
    if (!(error instanceof WorktreeError)) throw error;
    throw new RpcError(RpcErrorCode.INVALID_REQUEST, error.message, { kind: error.kind, files: error.files });
  }
};
