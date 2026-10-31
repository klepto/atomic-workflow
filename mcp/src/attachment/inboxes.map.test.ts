import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { mapCreateInboxes } from './inboxes.map.ts';
import type { InboxDelivery } from './inboxes.ts';

/**
 * Time in ms that a wait goes on after a message comes in, as `deliver` of `Inboxes` names a short delay.
 */
const BATCH_DELAY = 500;

/**
 * Promise of a session that never closes its inbox.
 */
const OPEN_FOREVER = new Promise<void>(() => undefined);

/**
 * Returns `settled` when `promise` has settled by the time the promises that are due now ran, else `pending`.
 */
const stateOf = async (promise: Promise<unknown>): Promise<'settled' | 'pending'> =>
  Promise.race([promise.then(() => 'settled' as const), Promise.resolve('pending' as const)]);

/**
 * Returns the delivery of the messages `contents` of the session `sessionId`, numbered from `firstId` on.
 */
const messagesOf = (sessionId: string, contents: readonly string[], firstId = 1): InboxDelivery => ({
  status: 'messages',
  sessionId,
  messages: contents.map((content, index) => ({ id: firstId + index, content })),
});

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
});

afterEach(() => {
  mock.timers.reset();
});

describe('mapCreateInboxes', () => {
  describe('open', () => {
    it('opens an empty inbox that takes messages', async () => {
      const inboxes = mapCreateInboxes();
      inboxes.open('session-1', OPEN_FOREVER);
      assert.equal(inboxes.deliver('session-1', 'hello'), true);
      assert.deepEqual(await inboxes.take('session-1', 0), messagesOf('session-1', ['hello']));
    });

    it('keeps the inbox and its messages of a session whose inbox is open already', async () => {
      const inboxes = mapCreateInboxes();
      inboxes.open('session-1', OPEN_FOREVER);
      inboxes.deliver('session-1', 'hello');
      inboxes.open('session-1', OPEN_FOREVER);
      assert.deepEqual(await inboxes.take('session-1', 0), messagesOf('session-1', ['hello']));
    });

    it('closes the inbox once closed resolves', async () => {
      const inboxes = mapCreateInboxes();
      const closed = Promise.withResolvers<void>();
      inboxes.open('session-1', closed.promise);
      closed.resolve();
      await closed.promise;
      assert.equal(inboxes.find('session-1'), undefined);
    });

    it('closes a kept inbox with the closed that it was opened with first', async () => {
      const inboxes = mapCreateInboxes();
      const first = Promise.withResolvers<void>();
      inboxes.open('session-1', first.promise);
      inboxes.open('session-1', OPEN_FOREVER);
      first.resolve();
      await first.promise;
      assert.equal(inboxes.find('session-1'), undefined);
    });
  });

  describe('move', () => {
    it('moves the inbox with its messages to the other session', async () => {
      const inboxes = mapCreateInboxes();
      inboxes.open('session-1', OPEN_FOREVER);
      inboxes.deliver('session-1', 'hello');
      inboxes.move('session-1', 'session-2');
      assert.equal(inboxes.find('session-1'), undefined);
      assert.deepEqual(await inboxes.take('session-2', 0), messagesOf('session-2', ['hello']));
    });

    it('moves the wait that is under way, which then names the other session', async () => {
      const inboxes = mapCreateInboxes();
      inboxes.open('session-1', OPEN_FOREVER);
      const wait = inboxes.take('session-1', 0);
      inboxes.move('session-1', 'session-2');
      inboxes.deliver('session-2', 'hello');
      mock.timers.tick(BATCH_DELAY);
      assert.deepEqual(await wait, messagesOf('session-2', ['hello']));
    });

    it('closes the inbox of the session when the other session has an inbox already', async () => {
      const inboxes = mapCreateInboxes();
      inboxes.open('session-1', OPEN_FOREVER);
      inboxes.open('session-2', OPEN_FOREVER);
      const wait = inboxes.take('session-1', 0);
      inboxes.move('session-1', 'session-2');
      assert.deepEqual(await wait, { status: 'stop' });
      assert.equal(inboxes.find('session-1'), undefined);
      assert.equal(inboxes.find('session-2'), 'session-2');
    });

    it('does nothing for a session without an inbox', () => {
      const inboxes = mapCreateInboxes();
      inboxes.move('session-1', 'session-2');
      assert.equal(inboxes.find('session-2'), undefined);
    });

    it('closes the moved inbox with the closed that it was opened with', async () => {
      const inboxes = mapCreateInboxes();
      const closed = Promise.withResolvers<void>();
      inboxes.open('session-1', closed.promise);
      inboxes.move('session-1', 'session-2');
      closed.resolve();
      await closed.promise;
      assert.equal(inboxes.find('session-2'), undefined);
    });
  });

  describe('close', () => {
    it('closes the inbox, ends its wait with stop, and returns true', async () => {
      const inboxes = mapCreateInboxes();
      inboxes.open('session-1', OPEN_FOREVER);
      const wait = inboxes.take('session-1', 0);
      assert.equal(inboxes.close('session-1'), true);
      assert.deepEqual(await wait, { status: 'stop' });
      assert.equal(inboxes.deliver('session-1', 'hello'), false);
    });

    it('returns false for a session without an inbox', () => {
      assert.equal(mapCreateInboxes().close('session-1'), false);
    });
  });

  describe('find', () => {
    it('returns the session whose inbox is open under the identifier', () => {
      const inboxes = mapCreateInboxes();
      inboxes.open('abc', OPEN_FOREVER);
      inboxes.open('abcdef', OPEN_FOREVER);
      assert.equal(inboxes.find('abc'), 'abc');
    });

    it('returns the only session whose id begins with the identifier', () => {
      const inboxes = mapCreateInboxes();
      inboxes.open('abcdef', OPEN_FOREVER);
      inboxes.open('xyz', OPEN_FOREVER);
      assert.equal(inboxes.find('abc'), 'abcdef');
    });

    it('returns undefined when more than one session id begins with the identifier', () => {
      const inboxes = mapCreateInboxes();
      inboxes.open('abc-1', OPEN_FOREVER);
      inboxes.open('abc-2', OPEN_FOREVER);
      assert.equal(inboxes.find('abc'), undefined);
    });

    it('returns undefined when no open inbox matches', () => {
      const inboxes = mapCreateInboxes();
      inboxes.open('abc', OPEN_FOREVER);
      assert.equal(inboxes.find('xyz'), undefined);
    });
  });

  describe('awaitOpen', () => {
    it('returns true at once for a session whose inbox is open', async () => {
      const inboxes = mapCreateInboxes();
      inboxes.open('session-1', OPEN_FOREVER);
      assert.equal(await inboxes.awaitOpen('session-1', 1000), true);
    });

    it('returns true once the inbox of the session opens', async () => {
      const inboxes = mapCreateInboxes();
      const opened = inboxes.awaitOpen('session-1', 1000);
      inboxes.open('session-1', OPEN_FOREVER);
      assert.equal(await opened, true);
    });

    it('returns true once an inbox moves to the session', async () => {
      const inboxes = mapCreateInboxes();
      inboxes.open('session-1', OPEN_FOREVER);
      const opened = inboxes.awaitOpen('session-2', 1000);
      inboxes.move('session-1', 'session-2');
      assert.equal(await opened, true);
    });

    it('returns false when no inbox opens within the timeout', async () => {
      const inboxes = mapCreateInboxes();
      const opened = inboxes.awaitOpen('session-1', 1000);
      mock.timers.tick(999);
      assert.equal(await stateOf(opened), 'pending');
      mock.timers.tick(1);
      assert.equal(await opened, false);
    });
  });

  describe('deliver', () => {
    it('ends the wait of the session a short delay later', async () => {
      const inboxes = mapCreateInboxes();
      inboxes.open('session-1', OPEN_FOREVER);
      const wait = inboxes.take('session-1', 0);
      inboxes.deliver('session-1', 'hello');
      mock.timers.tick(BATCH_DELAY - 1);
      assert.equal(await stateOf(wait), 'pending');
      mock.timers.tick(1);
      assert.deepEqual(await wait, messagesOf('session-1', ['hello']));
    });

    it('ends the wait once with every message of a burst', async () => {
      const inboxes = mapCreateInboxes();
      inboxes.open('session-1', OPEN_FOREVER);
      const wait = inboxes.take('session-1', 0);
      inboxes.deliver('session-1', 'first');
      mock.timers.tick(100);
      inboxes.deliver('session-1', 'second');
      mock.timers.tick(BATCH_DELAY - 100);
      assert.deepEqual(await wait, messagesOf('session-1', ['first', 'second']));
    });

    it('returns false for a session without an inbox', () => {
      assert.equal(mapCreateInboxes().deliver('session-1', 'hello'), false);
    });
  });

  describe('take', () => {
    it('returns the messages after the acknowledged number at once', async () => {
      const inboxes = mapCreateInboxes();
      inboxes.open('session-1', OPEN_FOREVER);
      inboxes.deliver('session-1', 'first');
      inboxes.deliver('session-1', 'second');
      assert.deepEqual(await inboxes.take('session-1', 1), messagesOf('session-1', ['second'], 2));
    });

    it('gives the same messages again while the session acknowledges none', async () => {
      const inboxes = mapCreateInboxes();
      inboxes.open('session-1', OPEN_FOREVER);
      inboxes.deliver('session-1', 'hello');
      await inboxes.take('session-1', 0);
      assert.deepEqual(await inboxes.take('session-1', 0), messagesOf('session-1', ['hello']));
    });

    it('waits for the next message once every message is acknowledged', async () => {
      const inboxes = mapCreateInboxes();
      inboxes.open('session-1', OPEN_FOREVER);
      inboxes.deliver('session-1', 'first');
      const wait = inboxes.take('session-1', 1);
      assert.equal(await stateOf(wait), 'pending');
      inboxes.deliver('session-1', 'second');
      mock.timers.tick(BATCH_DELAY);
      assert.deepEqual(await wait, messagesOf('session-1', ['second'], 2));
    });

    it('ends the wait under way with replaced on a second wait of the session', async () => {
      const inboxes = mapCreateInboxes();
      inboxes.open('session-1', OPEN_FOREVER);
      const first = inboxes.take('session-1', 0);
      void inboxes.take('session-1', 0);
      assert.deepEqual(await first, { status: 'replaced' });
    });

    it('returns stop for a session without an inbox', async () => {
      assert.deepEqual(await mapCreateInboxes().take('session-1', 0), { status: 'stop' });
    });

    it('returns stop when the inbox closes during the wait', async () => {
      const inboxes = mapCreateInboxes();
      const closed = Promise.withResolvers<void>();
      inboxes.open('session-1', closed.promise);
      const wait = inboxes.take('session-1', 0);
      closed.resolve();
      assert.deepEqual(await wait, { status: 'stop' });
    });
  });
});
