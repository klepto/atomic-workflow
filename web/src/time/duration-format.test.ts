import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatDuration, spanParts } from '@/time/duration-format.ts';

describe('spanParts', () => {
  it('splits a span into whole hours, minutes and seconds', () => {
    assert.deepEqual(spanParts(3_725_999), { hours: 1, minutes: 2, seconds: 5 });
  });

  it('counts a span below 0 as 0', () => {
    assert.deepEqual(spanParts(-5_000), { hours: 0, minutes: 0, seconds: 0 });
  });
});

describe('formatDuration', () => {
  it('shows the seconds alone under a minute', () => {
    assert.equal(formatDuration(45_900), '45s');
  });

  it('shows the minutes and the seconds under an hour', () => {
    assert.equal(formatDuration(116_000), '1m 56s');
  });

  it('shows the hours and the minutes from an hour on', () => {
    assert.equal(formatDuration(3_725_000), '1h 2m');
  });

  it('shows a span below 0 as 0s', () => {
    assert.equal(formatDuration(-1), '0s');
  });
});
