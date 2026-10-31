import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { isOnline, setOnline, subscribeConnection } from '@/api/connection.ts';

afterEach(() => {
  setOnline(true);
});

describe('isOnline', () => {
  it('returns true at the start', () => {
    assert.equal(isOnline(), true);
  });
});

describe('setOnline', () => {
  it('sets the connection', () => {
    setOnline(false);
    assert.equal(isOnline(), false);
  });
});

describe('subscribeConnection', () => {
  it('calls the listener on each change of the connection', () => {
    const seen: boolean[] = [];
    const stop = subscribeConnection(() => seen.push(isOnline()));
    setOnline(false);
    setOnline(true);
    stop();
    assert.deepEqual(seen, [false, true]);
  });

  it('calls the listener not for a value that does not change the connection', () => {
    let calls = 0;
    const stop = subscribeConnection(() => {
      calls += 1;
    });
    setOnline(true);
    stop();
    assert.equal(calls, 0);
  });

  it('calls the listener no more once it stopped', () => {
    let calls = 0;
    const stop = subscribeConnection(() => {
      calls += 1;
    });
    stop();
    setOnline(false);
    assert.equal(calls, 0);
  });
});
