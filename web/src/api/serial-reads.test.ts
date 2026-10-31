import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { serialReads } from '@/api/serial-reads.ts';

/**
 * Read for tests that ends only when the test ends it.
 */
interface ControlledRead {
  /**
   * Function to pass to `serialReads`.
   */
  readonly read: () => Promise<void>;

  /**
   * Number of reads that started so far.
   */
  readonly started: () => number;

  /**
   * Ends the oldest read that runs.
   */
  readonly end: () => void;
}

/**
 * Returns a read that starts at each call and ends only on `end`.
 */
const controlledRead = (): ControlledRead => {
  const pending: (() => void)[] = [];
  let started = 0;
  return {
    read: () => {
      started += 1;
      return new Promise((resolve) => pending.push(resolve));
    },
    started: () => started,
    end: () => pending.shift()?.(),
  };
};

/**
 * Waits a few turns of the microtask queue, so that the callbacks of the promises that settled meanwhile run.
 */
const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 5; turn += 1) {
    await Promise.resolve();
  }
};

describe('serialReads', () => {
  it('starts a read on a call while no read runs', async () => {
    const reads = controlledRead();
    const run = serialReads(reads.read);
    const done = run();
    assert.equal(reads.started(), 1);
    reads.end();
    await done;
  });

  it('starts no second read while a read runs, and one more read once it ends', async () => {
    const reads = controlledRead();
    const run = serialReads(reads.read);
    void run();
    void run();
    assert.equal(reads.started(), 1);
    reads.end();
    await settle();
    assert.equal(reads.started(), 2);
    reads.end();
    await settle();
  });

  it('queues one read however many calls come during a read', async () => {
    const reads = controlledRead();
    const run = serialReads(reads.read);
    void run();
    const second = run();
    const third = run();
    assert.equal(second, third);
    reads.end();
    await settle();
    reads.end();
    await second;
    assert.equal(reads.started(), 2);
  });

  it('resolves a call during a read only once the queued read ended', async () => {
    const reads = controlledRead();
    const run = serialReads(reads.read);
    const order: string[] = [];
    void run().then(() => order.push('first'));
    void run().then(() => order.push('queued'));
    reads.end();
    await settle();
    assert.deepEqual(order, ['first']);
    reads.end();
    await settle();
    assert.deepEqual(order, ['first', 'queued']);
  });

  it('starts a new read on a call after every read ended', async () => {
    const reads = controlledRead();
    const run = serialReads(reads.read);
    const first = run();
    reads.end();
    await first;
    const second = run();
    assert.equal(reads.started(), 2);
    reads.end();
    await second;
  });
});
