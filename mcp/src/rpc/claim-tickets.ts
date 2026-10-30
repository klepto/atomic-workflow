import type { ClaimHolder } from '../attachment/ticket-claims.ts';
import type { MethodContext } from './method.ts';
import { plural } from './plural.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

/**
 * Returns the caller of `context` as the holder of claims that last until its connection closes, such as the claim of
 * a ticket that it starts. A caller without a connection fails with an invalid request.
 */
export const lastingHolder = (context: MethodContext): ClaimHolder => {
  if (context.caller !== undefined) return context.caller;
  throw new RpcError(
    RPC_ERROR_CODES.INVALID_REQUEST,
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
 * Claims each ticket of `ticketIds` of the task `taskId` for `holder` in the claims of `context`, and returns the ids
 * of the ones that the call claimed, which `holder` did not hold already. A ticket that another holder holds fails with
 * an invalid request, and leaves no new claim.
 */
export const claimTickets = (
  taskId: number,
  ticketIds: readonly number[],
  holder: ClaimHolder,
  context: MethodContext,
): readonly number[] => {
  const held = ticketIds.filter((id) => context.ticketClaims.isHeldByOther(taskId, id, holder));
  if (held.length > 0)
    throw new RpcError(
      RPC_ERROR_CODES.INVALID_REQUEST,
      `${plural(held.length, 'Ticket', 'Tickets')} ${held.join(', ')} of task ${taskId} ${plural(held.length, 'is', 'are')} in progress in another session`,
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
 * session holds fails with an invalid request, and `operation` does not run. Rejects as `operation` does.
 */
export const endWork = async <Value>(
  taskId: number,
  ticketIds: readonly number[],
  operation: () => Promise<Value>,
  context: MethodContext,
): Promise<Value> => {
  claimTickets(taskId, ticketIds, callHolder(context), context);
  try {
    return await operation();
  } finally {
    releaseTickets(taskId, ticketIds, context);
  }
};
