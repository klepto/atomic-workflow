import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatFullTime, formatMessageTime } from '@/time/time-format.ts';

/**
 * Time of a message, on 31 October 2026 at 14:05:09 in local time, in ms since the epoch.
 */
const TIME = new Date(2026, 9, 31, 14, 5, 9).getTime();

describe('formatMessageTime', () => {
  it('shows the hour and the minute alone on the day of now', () => {
    const now = new Date(2026, 9, 31, 23, 59).getTime();
    assert.equal(formatMessageTime(TIME, now, 'de-DE'), '14:05');
  });

  it('shows the date before the hour and the minute on another day', () => {
    const now = new Date(2026, 10, 1, 0, 1).getTime();
    assert.equal(formatMessageTime(TIME, now, 'de-DE'), '31.10.2026, 14:05');
  });

  it('shows the date on the same day of another year', () => {
    const now = new Date(2027, 9, 31, 14, 5).getTime();
    assert.equal(formatMessageTime(TIME, now, 'de-DE'), '31.10.2026, 14:05');
  });

  it('returns a time that is not valid as a string', () => {
    assert.equal(formatMessageTime(Number.NaN, TIME), 'NaN');
  });
});

describe('formatFullTime', () => {
  it('shows the weekday, the full date and the seconds', () => {
    const label = formatFullTime(TIME, 'en-GB');
    for (const part of ['Saturday', '31 October 2026', '14:05:09']) {
      assert.equal(label.includes(part), true, `${label} holds ${part}`);
    }
  });

  it('returns a time that is not valid as a string', () => {
    assert.equal(formatFullTime(Number.POSITIVE_INFINITY), 'Infinity');
  });
});
