import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plural } from './plural.ts';

describe('plural', () => {
  it('returns the singular for a count of 1', () => {
    assert.equal(plural(1, 'Ticket', 'Tickets'), 'Ticket');
  });

  it('returns the plural for a count of 0', () => {
    assert.equal(plural(0, 'Ticket', 'Tickets'), 'Tickets');
  });

  it('returns the plural for a count greater than 1', () => {
    assert.equal(plural(3, 'Ticket', 'Tickets'), 'Tickets');
  });
});
