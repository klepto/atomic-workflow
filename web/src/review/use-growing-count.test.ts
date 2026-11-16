import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextCount } from '@/review/use-growing-count.ts';

describe('nextCount', () => {
  it('adds one step to the count while the list has more items', () => {
    assert.equal(nextCount(20, 120, 20), 40);
  });

  it('stops at the number of items of the list', () => {
    assert.equal(nextCount(100, 110, 20), 110);
  });

  it('keeps a count that holds every item', () => {
    assert.equal(nextCount(120, 120, 20), 120);
  });

  it('gives no more than the items of an empty list', () => {
    assert.equal(nextCount(0, 0, 20), 0);
  });
});
