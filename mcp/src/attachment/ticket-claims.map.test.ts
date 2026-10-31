import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapCreateTicketClaims } from './ticket-claims.map.ts';
import type { ClaimHolder } from './ticket-claims.ts';

/**
 * Holder of claims of a test, which goes away when the test calls `close`.
 */
interface TestHolder extends ClaimHolder {
  /**
   * Makes the holder go away.
   */
  close(): void;
}

/**
 * Returns a new holder that goes away once the test calls its `close`.
 */
const holder = (): TestHolder => {
  const { promise, resolve } = Promise.withResolvers<void>();
  return { closed: promise, close: () => resolve() };
};

describe('mapCreateTicketClaims', () => {
  describe('claim', () => {
    it('returns claimed for a free ticket', () => {
      assert.equal(mapCreateTicketClaims().claim(1, 2, holder()), 'claimed');
    });

    it('returns kept for a ticket that the claimant holds already', () => {
      const claims = mapCreateTicketClaims();
      const claimant = holder();
      claims.claim(1, 2, claimant);
      assert.equal(claims.claim(1, 2, claimant), 'kept');
    });

    it('returns refused for a ticket that another holder holds, which keeps it', () => {
      const claims = mapCreateTicketClaims();
      const first = holder();
      claims.claim(1, 2, first);
      assert.equal(claims.claim(1, 2, holder()), 'refused');
      assert.equal(claims.claim(1, 2, first), 'kept');
    });

    it('keeps the tickets of each task apart', () => {
      const claims = mapCreateTicketClaims();
      claims.claim(1, 2, holder());
      assert.equal(claims.claim(2, 1, holder()), 'claimed');
      assert.equal(claims.claim(1, 3, holder()), 'claimed');
    });

    it('releases the tickets of a holder once it goes away', async () => {
      const claims = mapCreateTicketClaims();
      const first = holder();
      claims.claim(1, 2, first);
      first.close();
      await first.closed;
      assert.equal(claims.claim(1, 2, holder()), 'claimed');
    });
  });

  describe('isHeldByOther', () => {
    it('returns true for a ticket that another holder holds', () => {
      const claims = mapCreateTicketClaims();
      claims.claim(1, 2, holder());
      assert.equal(claims.isHeldByOther(1, 2, holder()), true);
    });

    it('returns false for a ticket that the caller holds', () => {
      const claims = mapCreateTicketClaims();
      const caller = holder();
      claims.claim(1, 2, caller);
      assert.equal(claims.isHeldByOther(1, 2, caller), false);
    });

    it('returns false for a free ticket', () => {
      assert.equal(mapCreateTicketClaims().isHeldByOther(1, 2, holder()), false);
    });
  });

  describe('release', () => {
    it('frees the ticket, whoever holds it', () => {
      const claims = mapCreateTicketClaims();
      claims.claim(1, 2, holder());
      claims.release(1, 2);
      assert.equal(claims.claim(1, 2, holder()), 'claimed');
    });

    it('leaves a free ticket free', () => {
      const claims = mapCreateTicketClaims();
      claims.release(1, 2);
      assert.equal(claims.isHeldByOther(1, 2, holder()), false);
    });

    it('keeps the claim of a new holder when the released holder goes away', async () => {
      const claims = mapCreateTicketClaims();
      const first = holder();
      claims.claim(1, 2, first);
      claims.release(1, 2);
      const second = holder();
      claims.claim(1, 2, second);
      first.close();
      await first.closed;
      assert.equal(claims.isHeldByOther(1, 2, holder()), true);
    });
  });
});
