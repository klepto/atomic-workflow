import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { inboxAwaitCommandMethod } from './method.inbox-await-command.ts';
import type { MethodContext } from './method.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Time in ms that a wait goes on after a message comes in, as the inboxes batch the messages.
 */
const BATCH_DELAY = 500;

/**
 * Promise of an inbox that never closes on its own.
 */
const NEVER_CLOSED = new Promise<void>(() => undefined);

/**
 * Returns a context in which the session `sessionId` has an open inbox with the messages `contents`.
 */
const inboxContext = (sessionId: string, ...contents: readonly string[]): MethodContext => {
  const context = testMethodContext();
  context.inboxes.open(sessionId, NEVER_CLOSED);
  for (const content of contents) context.inboxes.deliver(sessionId, content);
  return context;
};

// The inboxes batch the messages that they deliver with a timer, which must not run for real.
beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(() => mock.timers.reset());

describe('inboxAwaitCommandMethod', () => {
  it('returns the messages that wait in the inbox at once', async () => {
    const context = inboxContext('main', 'Plan the cache');
    assert.deepEqual(await testCall(inboxAwaitCommandMethod, { sessionId: 'main' }, context), {
      status: 'messages',
      sessionId: 'main',
      messages: [{ id: 1, content: 'Plan the cache' }],
    });
  });

  it('acknowledges the messages up to the number after', async () => {
    const context = inboxContext('main', 'first', 'second');
    const delivery = await testCall(inboxAwaitCommandMethod, { sessionId: 'main', after: 1 }, context);
    assert.deepEqual(delivery, { status: 'messages', sessionId: 'main', messages: [{ id: 2, content: 'second' }] });
  });

  it('returns a message that comes in after the call starts', async () => {
    const context = inboxContext('main');
    const delivery = testCall(inboxAwaitCommandMethod, { sessionId: 'main', after: 0 }, context);
    context.inboxes.deliver('main', 'Plan the cache');
    mock.timers.tick(BATCH_DELAY);
    assert.deepEqual(await delivery, {
      status: 'messages',
      sessionId: 'main',
      messages: [{ id: 1, content: 'Plan the cache' }],
    });
  });

  it('finds the session by the beginning of its id', async () => {
    const context = inboxContext('session-1a2b3c4d', 'Plan the cache');
    assert.deepEqual(await testCall(inboxAwaitCommandMethod, { sessionId: 'session-1a' }, context), {
      status: 'messages',
      sessionId: 'session-1a2b3c4d',
      messages: [{ id: 1, content: 'Plan the cache' }],
    });
  });

  it('ends with stop for a session without an inbox', async () => {
    const delivery = await testCall(inboxAwaitCommandMethod, { sessionId: 'main' }, testMethodContext());
    assert.deepEqual(delivery, { status: 'stop' });
  });

  it('ends with stop once the inbox closes during the wait', async () => {
    const context = inboxContext('main');
    const delivery = testCall(inboxAwaitCommandMethod, { sessionId: 'main' }, context);
    context.inboxes.close('main');
    assert.deepEqual(await delivery, { status: 'stop' });
  });

  it('ends with replaced once a newer wait of the session takes over', async () => {
    const context = inboxContext('main');
    const first = testCall(inboxAwaitCommandMethod, { sessionId: 'main' }, context);
    const second = testCall(inboxAwaitCommandMethod, { sessionId: 'main' }, context);
    assert.deepEqual(await first, { status: 'replaced' });
    context.inboxes.close('main');
    assert.deepEqual(await second, { status: 'stop' });
  });

  it('attaches a started subagent with its first call', async () => {
    const context = inboxContext('sub', 'Plan the cache');
    context.subagents.start('sub', 'main', testConnection());
    await testCall(inboxAwaitCommandMethod, { sessionId: 'sub' }, context);
    assert.deepEqual(context.subagents.list(), [{ sessionId: 'sub', parentId: 'main' }]);
  });

  it('rejects an empty session id with invalid parameters', async () => {
    await assert.rejects(testCall(inboxAwaitCommandMethod, { sessionId: '' }, testMethodContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
    });
  });
});
