import type { ClaimHolder, CreateTicketClaimsFunction } from './ticket-claims.ts';

/**
 * `CreateTicketClaimsFunction` that keeps the holder of each claimed ticket in a map, by task and ticket.
 */
export const mapCreateTicketClaims: CreateTicketClaimsFunction = () => {
  const holders = new Map<string, ClaimHolder>();
  return {
    claim: (taskId, ticketId, claimant) => {
      const key = keyOf(taskId, ticketId);
      const holder = holders.get(key);
      if (holder === claimant) return 'kept';
      if (holder !== undefined) return 'refused';
      holders.set(key, claimant);
      void claimant.closed.then(() => {
        if (holders.get(key) === claimant) holders.delete(key);
      });
      return 'claimed';
    },
    isHeldByOther: (taskId, ticketId, caller) => {
      const holder = holders.get(keyOf(taskId, ticketId));
      return holder !== undefined && holder !== caller;
    },
    release: (taskId, ticketId) => {
      holders.delete(keyOf(taskId, ticketId));
    },
  };
};

/**
 * Returns the key of the ticket `ticketId` of the task `taskId` in the map of the holders.
 */
const keyOf = (taskId: number, ticketId: number): string => `${taskId}/${ticketId}`;
