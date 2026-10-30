import type { ClaimHolder, ClaimOutcome, CreateTicketClaimsFunction } from './ticket-claims.ts';

/**
 * Holders of the claimed tickets, by the key that `keyOf` gives each ticket.
 */
type Holders = Map<string, ClaimHolder>;

/**
 * `CreateTicketClaimsFunction` that keeps the holder of each claimed ticket in a map, by task and ticket.
 */
export const mapCreateTicketClaims: CreateTicketClaimsFunction = () => {
  const holders: Holders = new Map();
  return {
    claim: (taskId, ticketId, claimant) => claim(holders, keyOf(taskId, ticketId), claimant),
    isHeldByOther: (taskId, ticketId, caller) => isHeldByOther(holders, keyOf(taskId, ticketId), caller),
    release: (taskId, ticketId) => release(holders, keyOf(taskId, ticketId)),
  };
};

/**
 * Claims the ticket with the key `key` in `holders` for `claimant`, until `claimant` goes away, and returns the
 * outcome. A ticket that another holder holds stays with it.
 */
const claim = (holders: Holders, key: string, claimant: ClaimHolder): ClaimOutcome => {
  const holder = holders.get(key);
  if (holder === claimant) return 'kept';
  if (holder !== undefined) return 'refused';
  holders.set(key, claimant);
  void claimant.closed.then(() => {
    if (holders.get(key) === claimant) holders.delete(key);
  });
  return 'claimed';
};

/**
 * Returns whether a holder other than `caller` holds the ticket with the key `key` in `holders`.
 */
const isHeldByOther = (holders: Holders, key: string, caller: ClaimHolder): boolean => {
  const holder = holders.get(key);
  return holder !== undefined && holder !== caller;
};

/**
 * Releases the ticket with the key `key` in `holders`, whoever holds it.
 */
const release = (holders: Holders, key: string): void => {
  holders.delete(key);
};

/**
 * Returns the key of the ticket `ticketId` of the task `taskId` in the map of the holders.
 */
const keyOf = (taskId: number, ticketId: number): string => `${taskId}/${ticketId}`;
