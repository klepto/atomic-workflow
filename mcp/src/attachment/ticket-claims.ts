import { mapCreateTicketClaims } from './ticket-claims.map.ts';

/**
 * Outcomes of a claim of a ticket: `claimed` when the ticket was free and the claimant holds it now, `kept` when the
 * claimant held it already, and `refused` when another holder holds it.
 */
export const CLAIM_OUTCOMES = ['claimed', 'kept', 'refused'] as const;

/**
 * Outcome of a claim of a ticket, one of `CLAIM_OUTCOMES`.
 */
export type ClaimOutcome = (typeof CLAIM_OUTCOMES)[number];

/**
 * Holder of claims of tickets, such as the connection of a client.
 */
export interface ClaimHolder {
  /**
   * Settles once the holder goes away, which releases each ticket that it holds.
   */
  readonly closed: Promise<void>;
}

/**
 * Claims of the tickets in progress, each held by the client that works on it. A claim lasts until it is released or
 * its holder goes away, so a session that ends releases its tickets.
 */
export interface TicketClaims {
  /**
   * Claims the ticket `ticketId` of the task `taskId` for `claimant`, and returns the outcome. A ticket that another
   * holder holds stays with it.
   */
  claim(taskId: number, ticketId: number, claimant: ClaimHolder): ClaimOutcome;

  /**
   * Returns whether a holder other than `caller` holds the ticket `ticketId` of the task `taskId`.
   */
  isHeldByOther(taskId: number, ticketId: number, caller: ClaimHolder): boolean;

  /**
   * Releases the ticket `ticketId` of the task `taskId`, whoever holds it. A ticket that nobody holds stays free.
   */
  release(taskId: number, ticketId: number): void;
}

/**
 * Function that returns new, empty `TicketClaims`.
 */
export type CreateTicketClaimsFunction = () => TicketClaims;

/**
 * Default `CreateTicketClaimsFunction`, which keeps the claims in memory.
 */
export const CreateTicketClaims: CreateTicketClaimsFunction = mapCreateTicketClaims;
