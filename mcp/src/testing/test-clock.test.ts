import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testClock } from './test-clock.ts';

describe('testClock', () => {
  it('starts at 0 without a start', () => {
    assert.equal(testClock().now(), 0);
  });

  it('starts at the time that the test gives', () => {
    assert.equal(testClock(1_000).now(), 1_000);
  });

  it('keeps its time while the test does not move it', () => {
    const clock = testClock(500);
    clock.now();
    assert.equal(clock.now(), 500);
  });

  it('moves forward by the span of each advance', () => {
    const clock = testClock(100);
    clock.advance(50);
    clock.advance(25);
    assert.equal(clock.now(), 175);
  });

  it('jumps to the time of a set', () => {
    const clock = testClock(100);
    clock.set(42);
    assert.equal(clock.now(), 42);
  });
});
